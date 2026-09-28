/* eslint-disable @typescript-eslint/naming-convention -- HTTP header names */
/**
 * Full-page cache for server-rendered pages that opt in (sequence pages, an organism's default search view). Crawlers
 * fetch each sequence page about once per ~16 h, so the rendered HTML is what pays to keep. An entry is valid while
 * its organism's polled data version is unchanged and it is younger than the maximum age; requests with credentials
 * never read or fill it. Server-only.
 */
import { randomBytes } from 'node:crypto';
import zlib from 'node:zlib';

import type { DataVersionSource, ObservedVersion } from './dataVersions.ts';
import type { BlobMeta, TieredBlobStore } from './serverCacheStore.ts';

export const PAGE_CACHE_STATUS_HEADER = 'x-loculus-page-cache';
export const EDGE_CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400';

const AUTH_COOKIES = ['access_token', 'refresh_token'];
/** OpenID Connect callback parameters: such a request must reach the auth middleware. */
const AUTH_PARAMS = ['code', 'state', 'session_state', 'iss'];
/** A dictionary is a prefix of the organism's first cached page. */
export const MAX_DICTIONARY_BYTES = 256 * 1024;

type ZstdOptions = { dictionary?: Buffer; params?: Record<number, number> };
type Zstd = {
    zstdCompressSync?: (buffer: Buffer, options?: ZstdOptions) => Buffer;
    zstdDecompressSync?: (buffer: Buffer, options?: ZstdOptions) => Buffer;
};
const zstd = zlib as unknown as Zstd;

export type PageCodecKind = 'zstd-dict' | 'zstd' | 'gzip';

/** zstd with a dictionary when this Node honours it, else plain zstd, else gzip; checked by a round trip. */
export function detectPageCodec(): PageCodecKind {
    const compress = zstd.zstdCompressSync;
    const decompress = zstd.zstdDecompressSync;
    if (compress === undefined || decompress === undefined) {
        return 'gzip';
    }
    try {
        const dictionary = Buffer.from(randomBytes(8192).toString('hex'));
        const sample = Buffer.concat([dictionary.subarray(0, 8000), Buffer.from('a small difference')]);
        const withDictionary = compress(sample, { dictionary });
        const roundTrip = decompress(withDictionary, { dictionary });
        return withDictionary.length < compress(sample).length / 4 && roundTrip.equals(sample) ? 'zstd-dict' : 'zstd';
    } catch (_) {
        return 'zstd';
    }
}

/**
 * Pages of one organism share most of their HTML (layout, schema, serialised island props), so compressing against a
 * previous page of the same organism shrinks a sequence page from ~32 KB to ~3–8 KB. Dictionaries live as long as the
 * process, like the disk entries, which are discarded at startup.
 */
export class PageCodec {
    private readonly dictionaries = new Map<string, { id: string; dictionary: Buffer }>();
    private readonly byId = new Map<string, Buffer>();

    constructor(public readonly kind: PageCodecKind = detectPageCodec()) {}

    public get dictionaryBytes() {
        return [...this.byId.values()].reduce((sum, dictionary) => sum + dictionary.length, 0);
    }

    public encode(organism: string, html: Buffer): { codec: string; body: Buffer } {
        if (this.kind === 'gzip') {
            return { codec: 'gzip', body: zlib.gzipSync(html) };
        }
        const level = { [zlib.constants.ZSTD_c_compressionLevel]: 3 };
        if (this.kind === 'zstd-dict') {
            let entry = this.dictionaries.get(organism);
            if (entry === undefined) {
                entry = {
                    id: `${organism}#${randomBytes(4).toString('hex')}`,
                    dictionary: Buffer.from(html.subarray(0, MAX_DICTIONARY_BYTES)),
                };
                this.dictionaries.set(organism, entry);
                this.byId.set(entry.id, entry.dictionary);
            }
            return {
                codec: `zstd-dict:${entry.id}`,
                body: zstd.zstdCompressSync!(html, { dictionary: entry.dictionary, params: level }),
            };
        }
        return { codec: 'zstd', body: zstd.zstdCompressSync!(html, { params: level }) };
    }

    /** Throws when the body cannot be decoded. */
    public decode(codec: string | undefined, body: Buffer): Buffer {
        if (codec === 'gzip') {
            return zlib.gunzipSync(body);
        }
        if (codec === 'zstd') {
            return zstd.zstdDecompressSync!(body);
        }
        if (codec?.startsWith('zstd-dict:') === true) {
            const dictionary = this.byId.get(codec.slice('zstd-dict:'.length));
            if (dictionary === undefined) {
                throw new Error(`unknown dictionary ${codec}`);
            }
            return zstd.zstdDecompressSync!(body, { dictionary });
        }
        throw new Error(`unknown codec ${codec}`);
    }
}

export type PageCacheStats = {
    hits: number;
    /** renders of opted-in pages that were not served from the cache */
    misses: number;
    /** cacheable requests for pages that do not opt in (probes, API routes, pages without `pageCacheOrganism`) */
    notOptedIn: number;
    /** requests with credentials, non-GET, OIDC callbacks */
    bypassed: number;
    stored: number;
    /** cacheable render not stored: the organism's version is unknown, just changed, or changed during the render */
    notAdmitted: number;
    /** opted-in render not storable: not 200, sets cookies, not HTML */
    uncacheable: number;
    /** entry of an older data version found at lookup */
    stale: number;
    expired: number;
    decodeErrors: number;
};

const emptyPageStats = (): PageCacheStats => ({
    hits: 0,
    misses: 0,
    notOptedIn: 0,
    bypassed: 0,
    stored: 0,
    notAdmitted: 0,
    uncacheable: 0,
    stale: 0,
    expired: 0,
    decodeErrors: 0,
});

export type PageRequest = { method: string; url: URL; headers: Headers };

export type RenderedPage = {
    response: Response;
    /** Set by a page that may be cached: the organism whose data it shows. */
    organism: string | undefined;
    /** Cookies the render set (Astro attaches them after the middleware chain). */
    setsCookies: boolean;
};

export type PageCacheOptions = {
    maxAgeMs: number;
    /**
     * After a version is first observed, renders are not stored for this long: data served inside the SSR LAPIS
     * freshness window may predate it, and the engine can expose a new version slightly before its rows.
     */
    admitAfterMs: number;
    edgeCacheHeaders: boolean;
    now?: () => number;
};

export function hasCredentials(headers: Headers): boolean {
    if (headers.has('authorization')) {
        return true;
    }
    const cookies = (headers.get('cookie') ?? '').split(';').map((cookie) => cookie.split('=')[0].trim());
    return cookies.some((name) => AUTH_COOKIES.includes(name));
}

/** Path plus sorted query parameters; undefined for requests that must not be cached. */
export function pageCacheKey(url: URL): string | undefined {
    const params = [...url.searchParams.entries()];
    if (params.some(([name]) => AUTH_PARAMS.includes(name))) {
        return undefined;
    }
    params.sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1));
    return `${url.pathname}?${new URLSearchParams(params).toString()}`;
}

function withHeaders(response: Response, headers: Record<string, string>, body?: BodyInit | null): Response {
    const merged = new Headers(response.headers);
    for (const [name, value] of Object.entries(headers)) {
        merged.set(name, value);
    }
    return new Response(body !== undefined ? body : response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: merged,
    });
}

export class PageCache {
    public readonly stats = emptyPageStats();
    private readonly now: () => number;

    constructor(
        public readonly blobs: TieredBlobStore,
        private readonly versions: DataVersionSource,
        public readonly codec: PageCodec,
        private readonly options: PageCacheOptions,
    ) {
        this.now = options.now ?? Date.now;
    }

    private get edgeHeaders(): Record<string, string> {
        return this.options.edgeCacheHeaders ? { 'Cache-Control': EDGE_CACHE_CONTROL, 'Vary': 'Cookie' } : {};
    }

    public async handle(request: PageRequest, render: () => Promise<RenderedPage>): Promise<Response> {
        const key = request.method === 'GET' ? pageCacheKey(request.url) : undefined;
        if (key === undefined || hasCredentials(request.headers)) {
            this.stats.bypassed++;
            const rendered = await render();
            return rendered.organism !== undefined && this.options.edgeCacheHeaders
                ? withHeaders(rendered.response, { 'Cache-Control': 'private, no-store' })
                : rendered.response;
        }

        const hit = await this.lookup(key);
        if (hit !== undefined) {
            this.stats.hits++;
            return new Response(new Uint8Array(hit.html), {
                status: 200,
                headers: {
                    'Content-Type': hit.meta.contentType ?? 'text/html',
                    [PAGE_CACHE_STATUS_HEADER]: 'hit',
                    ...this.edgeHeaders,
                },
            });
        }

        const versionsAtStart = this.versions.snapshot();
        const startedAt = this.now();
        const rendered = await render();
        if (rendered.organism === undefined) {
            this.stats.notOptedIn++;
            return rendered.response;
        }
        this.stats.misses++;
        return this.admit(key, rendered, versionsAtStart.get.bind(versionsAtStart), startedAt);
    }

    private async lookup(key: string): Promise<{ meta: BlobMeta; html: Buffer } | undefined> {
        const hit = this.blobs.lookup(key);
        if (hit === undefined) {
            return undefined;
        }
        const current = hit.meta.group === undefined ? undefined : this.versions.current(hit.meta.group);
        if (current?.version !== hit.meta.tag) {
            this.stats.stale++;
            this.blobs.delete(key);
            return undefined;
        }
        if (this.now() - hit.meta.storedAt > this.options.maxAgeMs) {
            this.stats.expired++;
            this.blobs.delete(key);
            return undefined;
        }
        const body = await hit.load();
        if (body === undefined) {
            return undefined;
        }
        try {
            return { meta: hit.meta, html: this.codec.decode(hit.meta.codec, body) };
        } catch (_) {
            this.stats.decodeErrors++;
            this.blobs.delete(key);
            return undefined;
        }
    }

    private async admit(
        key: string,
        rendered: RenderedPage,
        versionAtStart: (organism: string) => ObservedVersion | undefined,
        startedAt: number,
    ): Promise<Response> {
        const { response, organism, setsCookies } = rendered;
        if (organism === undefined) {
            return response;
        }
        const contentType = response.headers.get('content-type') ?? '';
        if (
            response.status !== 200 ||
            setsCookies ||
            response.headers.has('set-cookie') ||
            !contentType.startsWith('text/html')
        ) {
            this.stats.uncacheable++;
            return response;
        }
        const before = versionAtStart(organism);
        const after = this.versions.current(organism);
        const settled =
            before !== undefined &&
            before.version === after?.version &&
            startedAt >= before.since + this.options.admitAfterMs;
        if (!settled) {
            this.stats.notAdmitted++;
            return withHeaders(response, { [PAGE_CACHE_STATUS_HEADER]: 'miss', ...this.edgeHeaders });
        }
        const html = Buffer.from(await response.arrayBuffer());
        const { codec, body } = this.codec.encode(organism, html);
        const now = this.now();
        if (
            this.blobs.put(
                key,
                {
                    tag: after.version,
                    storedAt: now,
                    validatedAt: now,
                    contentType,
                    group: organism,
                    version: after.version,
                    codec,
                },
                body,
            )
        ) {
            this.stats.stored++;
        }
        return withHeaders(response, { [PAGE_CACHE_STATUS_HEADER]: 'miss', ...this.edgeHeaders }, new Uint8Array(html));
    }
}

/**
 * Drops entries of an organism's previous data version once `graceMs` has passed after the change was observed (in
 * the background; lookups also drop them lazily), and entries past the maximum age.
 */
export function createCacheMaintenance(options: {
    stores: TieredBlobStore[];
    versions: DataVersionSource;
    graceMs: number;
    maxAgeMs: number;
    now?: () => number;
    schedule?: (task: () => void, delayMs: number) => void;
    onSwept?: (message: string) => void;
}) {
    const now = options.now ?? Date.now;
    const schedule =
        options.schedule ??
        ((task: () => void, delayMs: number) => {
            setTimeout(task, delayMs).unref();
        });

    const purgeOldVersions = (organism: string) => {
        const current = options.versions.current(organism)?.version;
        if (current === undefined) {
            return;
        }
        const swept = options.stores.reduce(
            (sum, store) => sum + store.sweep((meta) => meta.group === organism && meta.version !== current),
            0,
        );
        options.onSwept?.(`website cache: dropped ${swept} entries of ${organism} older than data version ${current}`);
    };

    return {
        onVersionChange: (organism: string) => schedule(() => purgeOldVersions(organism), options.graceMs),
        sweepExpired: () => {
            const cutoff = now() - options.maxAgeMs;
            return options.stores.reduce((sum, store) => sum + store.sweep((meta) => meta.storedAt < cutoff), 0);
        },
    };
}
