/**
 * Conditional-request cache for LAPIS calls, as an axios adapter.
 *
 * The query engine tags every query response with a weak ETag that encodes the data version, the index content and
 * the request, and answers a matching `If-None-Match` with an empty 304, for POST too. This adapter keeps
 * (ETag, raw body) per request and sends `If-None-Match` on every repeat, so a repeat costs a round trip but no
 * query work and no body transfer. A stored body is only returned after the server confirmed its ETag, except within
 * an optional freshness window (server side only). Responses without an ETag (e.g. LAPIS/SILO, errors) pass through.
 */
import axios, {
    AxiosError,
    AxiosHeaders,
    type AxiosAdapter,
    type AxiosResponse,
    type InternalAxiosRequestConfig,
} from 'axios';

export type StoredResponse = { body: string; contentType: string | undefined };

export type CacheLookup = {
    etag: string;
    validatedAt: number;
    /** Resolves to undefined when the body can no longer be read (evicted, corrupt file). */
    load: () => Promise<StoredResponse | undefined>;
};

export interface ConditionalCacheStore {
    lookup(key: string): CacheLookup | undefined | Promise<CacheLookup | undefined>;
    /** Returns false when the store declined the entry (too big). */
    put(key: string, etag: string, response: StoredResponse, validatedAt: number): boolean;
    /** The server confirmed the stored ETag: refresh the entry's validation time and recency. */
    confirm(key: string, validatedAt: number): void;
    delete(key: string): void;
}

export type ConditionalCacheStats = {
    /** served from the store within the freshness window, no request */
    fresh: number;
    /** 304: stored body reused */
    notModified: number;
    /** no usable entry: full 200 */
    miss: number;
    /** entry existed but the server sent a new 200 */
    changed: number;
    /** 304 whose ETag did not match or whose stored body was unreadable: re-sent without If-None-Match */
    retried: number;
    /** 200s stored */
    stored: number;
    /** 2xx not stored: no ETag, `no-store`, `Vary: *`, non-text body */
    uncacheable: number;
    /** requests not eligible at all: Authorization, streams, non-GET/POST, caller-set conditional headers */
    bypassed: number;
};

export const emptyStats = (): ConditionalCacheStats => ({
    fresh: 0,
    notModified: 0,
    miss: 0,
    changed: 0,
    retried: 0,
    stored: 0,
    uncacheable: 0,
    bypassed: 0,
});

/** Header on responses served from the cache, for debugging: `fresh` or `revalidated`. */
export const CACHE_STATUS_HEADER = 'x-loculus-lapis-cache';

const sortedKeysJson = (value: unknown): string =>
    JSON.stringify(value, (_key, inner: unknown) =>
        inner !== null && typeof inner === 'object' && !Array.isArray(inner)
            ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
            : inner,
    );

function normaliseBody(data: unknown): string | undefined {
    if (data === undefined || data === null || data === '') {
        return '';
    }
    if (typeof data === 'string') {
        try {
            return sortedKeysJson(JSON.parse(data));
        } catch (_) {
            return `raw:${data}`;
        }
    }
    if (typeof data === 'object' && Object.getPrototypeOf(data) === Object.prototype) {
        return sortedKeysJson(data);
    }
    return undefined; // FormData, streams, buffers
}

/**
 * The cache key: method, full URL with query parameters, normalised JSON body, and the representation headers the
 * response varies on. Undefined when the request must not be cached.
 */
export function requestCacheKey(config: InternalAxiosRequestConfig): string | undefined {
    const method = (config.method ?? 'get').toLowerCase();
    if (method !== 'get' && method !== 'post') {
        return undefined;
    }
    if (config.responseType !== undefined && config.responseType !== 'json' && config.responseType !== 'text') {
        return undefined;
    }
    const headers = AxiosHeaders.from(config.headers);
    if (
        config.auth !== undefined ||
        headers.has('Authorization') ||
        headers.has('Cookie') ||
        headers.has('If-None-Match') ||
        headers.has('If-Modified-Since')
    ) {
        return undefined;
    }
    const body = normaliseBody(config.data);
    if (body === undefined) {
        return undefined;
    }
    const headerValue = (name: string) => {
        const value = headers.get(name);
        return typeof value === 'string' ? value : '';
    };
    return JSON.stringify([method, axios.getUri(config), headerValue('Accept'), headerValue('Accept-Encoding'), body]);
}

const opaqueTag = (etag: string) => etag.trim().replace(/^W\//, '');

const responseHeader = (response: AxiosResponse, name: string): string | undefined => {
    const value = AxiosHeaders.from(response.headers as AxiosHeaders).get(name);
    return typeof value === 'string' && value !== '' ? value : undefined;
};

function isStorable(response: AxiosResponse): string | undefined {
    if (response.status !== 200 || typeof response.data !== 'string') {
        return undefined;
    }
    const cacheControl = responseHeader(response, 'Cache-Control')?.toLowerCase() ?? '';
    const vary = responseHeader(response, 'Vary') ?? '';
    if (cacheControl.includes('no-store') || cacheControl.includes('private') || vary.includes('*')) {
        return undefined;
    }
    return responseHeader(response, 'ETag');
}

function settleLikeAxios(config: InternalAxiosRequestConfig, response: AxiosResponse): AxiosResponse {
    const validateStatus = config.validateStatus;
    if (response.status === 0 || !validateStatus || validateStatus(response.status)) {
        return response;
    }
    throw new AxiosError(
        `Request failed with status code ${response.status}`,
        response.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
        config,
        response.request,
        response,
    );
}

function responseFromStore(
    config: InternalAxiosRequestConfig,
    stored: StoredResponse,
    etag: string,
    status: 'fresh' | 'revalidated',
    notModified?: AxiosResponse,
): AxiosResponse {
    const headers = AxiosHeaders.concat((notModified?.headers ?? {}) as AxiosHeaders);
    if (stored.contentType !== undefined) {
        headers.set('Content-Type', stored.contentType);
    }
    headers.delete('Content-Length');
    headers.set('ETag', etag);
    headers.set(CACHE_STATUS_HEADER, status);
    return {
        data: stored.body,
        status: 200,
        statusText: 'OK',
        headers,
        config,
        request: notModified?.request,
    };
}

export type ConditionalCacheOptions = {
    store: ConditionalCacheStore;
    stats?: ConditionalCacheStats;
    /** Serve a stored body without revalidating for this long after the server last confirmed it. 0 = always revalidate. */
    freshMs?: number;
    now?: () => number;
    /** The adapter that actually sends requests; defaults to axios' own. */
    baseAdapter?: AxiosAdapter;
};

export function createConditionalCacheAdapter(options: ConditionalCacheOptions): AxiosAdapter {
    const { store } = options;
    const stats = options.stats ?? emptyStats();
    const freshMs = options.freshMs ?? 0;
    const now = options.now ?? Date.now;
    const baseAdapter = options.baseAdapter ?? axios.getAdapter(axios.defaults.adapter);

    const sendConditional = (config: InternalAxiosRequestConfig, etag: string) => {
        const headers = AxiosHeaders.concat(config.headers);
        headers.set('If-None-Match', etag);
        const validateStatus = config.validateStatus;
        return baseAdapter({
            ...config,
            headers,
            validateStatus: (status) => status === 304 || !validateStatus || validateStatus(status),
        });
    };

    const keepOrForget = (key: string, response: AxiosResponse, outcome: 'miss' | 'changed') => {
        stats[outcome]++;
        const etag = isStorable(response);
        if (etag === undefined) {
            if (response.status >= 200 && response.status < 300) {
                stats.uncacheable++;
                store.delete(key);
            }
            return response;
        }
        const kept = store.put(
            key,
            etag,
            { body: response.data as string, contentType: responseHeader(response, 'Content-Type') },
            now(),
        );
        if (!kept) {
            stats.uncacheable++;
        } else {
            stats.stored++;
        }
        return response;
    };

    return async (config) => {
        const key = requestCacheKey(config);
        if (key === undefined) {
            stats.bypassed++;
            return baseAdapter(config);
        }

        let entry: CacheLookup | undefined;
        try {
            entry = await store.lookup(key);
        } catch (_) {
            entry = undefined;
        }

        if (entry !== undefined && freshMs > 0 && now() - entry.validatedAt < freshMs) {
            const stored = await entry.load().catch(() => undefined);
            if (stored !== undefined) {
                stats.fresh++;
                return responseFromStore(config, stored, entry.etag, 'fresh');
            }
            entry = undefined;
        }

        if (entry === undefined) {
            return keepOrForget(key, await baseAdapter(config), 'miss');
        }

        const response = await sendConditional(config, entry.etag);
        if (response.status !== 304) {
            return keepOrForget(key, settleLikeAxios(config, response), 'changed');
        }

        const confirmedTag = responseHeader(response, 'ETag');
        if (confirmedTag === undefined || opaqueTag(confirmedTag) === opaqueTag(entry.etag)) {
            const stored = await entry.load().catch(() => undefined);
            if (stored !== undefined) {
                stats.notModified++;
                store.confirm(key, now());
                return responseFromStore(config, stored, entry.etag, 'revalidated', response);
            }
        }

        stats.retried++;
        store.delete(key);
        return keepOrForget(key, await baseAdapter(config), 'miss');
    };
}

export type BodyCodec<T> = { encode: (body: string) => T; decode: (stored: T) => string; bytes: (stored: T) => number };

/** Strings as the browser holds them: UTF-16, 2 bytes per code unit. */
export const utf16StringCodec: BodyCodec<string> = {
    encode: (body) => body,
    decode: (body) => body,
    bytes: (body) => body.length * 2,
};

/** A byte-budgeted LRU. `onEvict` runs for entries pushed out by the budget, not for explicit deletes or replacements. */
export class ByteLru<V> {
    private readonly entries = new Map<string, { value: V; bytes: number }>();
    private usedBytes = 0;

    constructor(
        public readonly maxBytes: number,
        private readonly onEvict?: (key: string, value: V) => void,
    ) {}

    public get bytes() {
        return this.usedBytes;
    }

    public get size() {
        return this.entries.size;
    }

    public get(key: string): V | undefined {
        const entry = this.entries.get(key);
        if (entry === undefined) {
            return undefined;
        }
        this.entries.delete(key);
        this.entries.set(key, entry);
        return entry.value;
    }

    public set(key: string, value: V, bytes: number): boolean {
        this.delete(key);
        if (bytes > this.maxBytes) {
            return false;
        }
        this.entries.set(key, { value, bytes });
        this.usedBytes += bytes;
        while (this.usedBytes > this.maxBytes) {
            const oldestKey = this.entries.keys().next().value!;
            const oldest = this.entries.get(oldestKey)!;
            this.entries.delete(oldestKey);
            this.usedBytes -= oldest.bytes;
            this.onEvict?.(oldestKey, oldest.value);
        }
        return true;
    }

    public delete(key: string): V | undefined {
        const entry = this.entries.get(key);
        if (entry === undefined) {
            return undefined;
        }
        this.entries.delete(key);
        this.usedBytes -= entry.bytes;
        return entry.value;
    }
}

export type MemoryEntry<T> = { etag: string; validatedAt: number; body: T; contentType: string | undefined };

/** Fixed per-entry overhead added to the body size: key string, ETag, bookkeeping objects. */
const ENTRY_OVERHEAD_BYTES = 256;

export class MemoryCacheStore<T> implements ConditionalCacheStore {
    private readonly lru: ByteLru<MemoryEntry<T>>;

    constructor(
        maxBytes: number,
        private readonly codec: BodyCodec<T>,
        private readonly maxEntryBytes: number = maxBytes / 4,
        onEvict?: (key: string, entry: MemoryEntry<T>) => void,
    ) {
        this.lru = new ByteLru(maxBytes, onEvict);
    }

    public get bytes() {
        return this.lru.bytes;
    }

    public get size() {
        return this.lru.size;
    }

    public lookup(key: string): CacheLookup | undefined {
        const entry = this.lru.get(key);
        if (entry === undefined) {
            return undefined;
        }
        return {
            etag: entry.etag,
            validatedAt: entry.validatedAt,
            load: () => Promise.resolve({ body: this.codec.decode(entry.body), contentType: entry.contentType }),
        };
    }

    /** Returns false when the entry is too big for this store. */
    public put(key: string, etag: string, response: StoredResponse, validatedAt: number): boolean {
        const body = this.codec.encode(response.body);
        const bytes = this.codec.bytes(body) + key.length * 2 + ENTRY_OVERHEAD_BYTES;
        if (bytes > this.maxEntryBytes) {
            this.lru.delete(key);
            return false;
        }
        return this.lru.set(key, { etag, validatedAt, body, contentType: response.contentType }, bytes);
    }

    public confirm(key: string, validatedAt: number): boolean {
        const entry = this.lru.get(key);
        if (entry === undefined) {
            return false;
        }
        entry.validatedAt = validatedAt;
        return true;
    }

    public delete(key: string): void {
        this.lru.delete(key);
    }
}
