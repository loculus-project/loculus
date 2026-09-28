/**
 * Byte-budgeted server-side stores for the website's caches: a memory LRU that spills evicted entries to a disk LRU.
 * Bodies are Buffers (outside the V8 heap); each entry carries metadata used for validation and purging.
 * Server-only (node:fs).
 */
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { ByteLru } from './conditionalCache.ts';

const MiB = 1024 * 1024;
/** Files are accounted in whole filesystem blocks, so many small entries cannot overrun the emptyDir sizeLimit. */
const DISK_BLOCK_BYTES = 4096;
const MAX_ENTRY_BYTES_CAP = 64 * MiB;
/** Fixed per-entry overhead in memory: key, metadata object, Map slot. */
const MEMORY_ENTRY_OVERHEAD_BYTES = 256;

export type BlobMeta = {
    /** Validator: the ETag of a LAPIS response, or the data version of a page. */
    tag: string;
    storedAt: number;
    validatedAt: number;
    contentType?: string;
    /** The organism the entry belongs to, for purging on a data-version change. */
    group?: string;
    /** The organism's polled data version when the entry was stored or last confirmed. */
    version?: string;
    /** How the body is encoded (page cache). */
    codec?: string;
};

export type BlobLookup = { meta: BlobMeta; load: () => Promise<Buffer | undefined> };

export type StoreStats = {
    memoryHits: number;
    diskHits: number;
    diskWrites: number;
    diskErrors: number;
    promotions: number;
    /** entries dropped by a sweep: old data version after the grace period, or past the maximum age */
    swept: number;
    /** entries found past the maximum age at lookup */
    expired: number;
};

export const emptyStoreStats = (): StoreStats => ({
    memoryHits: 0,
    diskHits: 0,
    diskWrites: 0,
    diskErrors: 0,
    promotions: 0,
    swept: 0,
    expired: 0,
});

type DiskEntry = { meta: BlobMeta; file: string };

type DiskFileHeader = { v: 2; key: string; meta: BlobMeta; bodyBytes: number };

/**
 * One file per entry, sharded into 256 directories: a JSON header line, then the body. The index (key → metadata,
 * file) is in memory, so a revalidation that ends in a 200 never reads the file. Whatever is on disk at startup is
 * moved aside and deleted in the background: the emptyDir outlives container restarts, the index does not.
 */
export class DiskBlobStore {
    private readonly index: ByteLru<DiskEntry>;
    private readonly entriesDir: string;
    /** Resolves once all writes started so far have finished or failed; for tests and shutdown. */
    public pendingWrites: Promise<void> = Promise.resolve();

    constructor(
        dir: string,
        maxBytes: number,
        private readonly stats: StoreStats = emptyStoreStats(),
        private readonly maxEntryBytes: number = Math.min(maxBytes / 8, MAX_ENTRY_BYTES_CAP),
        private readonly onError: (message: string) => void = () => {},
    ) {
        fs.mkdirSync(dir, { recursive: true });
        this.entriesDir = path.join(dir, 'entries');
        if (fs.existsSync(this.entriesDir)) {
            fs.renameSync(this.entriesDir, path.join(dir, `old-entries-${randomBytes(6).toString('hex')}`));
        }
        for (const leftover of fs.readdirSync(dir).filter((name) => name.startsWith('old-entries-'))) {
            fs.promises.rm(path.join(dir, leftover), { recursive: true, force: true }).catch(() => {});
        }
        fs.mkdirSync(this.entriesDir);
        for (let shard = 0; shard < 256; shard++) {
            fs.mkdirSync(path.join(this.entriesDir, shard.toString(16).padStart(2, '0')));
        }
        this.index = new ByteLru(maxBytes, (_key, entry) => this.removeFile(entry.file));
    }

    public get bytes() {
        return this.index.bytes;
    }

    public get size() {
        return this.index.size;
    }

    private fileFor(key: string) {
        const hash = createHash('sha256').update(key).digest('hex');
        return path.join(this.entriesDir, hash.slice(0, 2), hash);
    }

    private removeFile(file: string) {
        fs.promises.unlink(file).catch(() => {});
    }

    public lookup(key: string): BlobLookup | undefined {
        const entry = this.index.get(key);
        if (entry === undefined) {
            return undefined;
        }
        return { meta: entry.meta, load: () => this.load(key, entry) };
    }

    private async load(key: string, entry: DiskEntry): Promise<Buffer | undefined> {
        try {
            const content = await fs.promises.readFile(entry.file);
            const newline = content.indexOf(0x0a);
            if (newline < 0) {
                throw new Error('no header line');
            }
            const header = JSON.parse(content.subarray(0, newline).toString('utf8')) as Partial<DiskFileHeader>;
            const body = content.subarray(newline + 1);
            if (header.v !== 2 || header.key !== key || header.meta?.tag !== entry.meta.tag) {
                throw new Error('header does not match the entry');
            }
            if (header.bodyBytes !== body.length) {
                throw new Error(`truncated: ${body.length} of ${header.bodyBytes} bytes`);
            }
            return body;
        } catch (e) {
            this.stats.diskErrors++;
            this.onError(`website cache: discarding unreadable disk entry ${entry.file}: ${(e as Error).message}`);
            if (this.index.peek(key) === entry) {
                this.index.delete(key);
            }
            this.removeFile(entry.file);
            return undefined;
        }
    }

    /** Writes asynchronously; the entry becomes visible once its file is complete. False if it is too big. */
    public put(key: string, meta: BlobMeta, body: Buffer): boolean {
        const header: DiskFileHeader = { v: 2, key, meta, bodyBytes: body.length };
        const content = Buffer.concat([Buffer.from(JSON.stringify(header) + '\n', 'utf8'), body]);
        const bytes = Math.ceil(content.length / DISK_BLOCK_BYTES) * DISK_BLOCK_BYTES;
        if (bytes > this.maxEntryBytes) {
            this.delete(key);
            return false;
        }
        const entry = { meta: { ...meta }, file: this.fileFor(key) };
        const tmp = `${entry.file}.tmp-${randomBytes(6).toString('hex')}`;
        const done = (async () => {
            try {
                await fs.promises.writeFile(tmp, content);
                await fs.promises.rename(tmp, entry.file);
                this.index.set(key, entry, bytes);
                this.stats.diskWrites++;
            } catch (e) {
                this.stats.diskErrors++;
                this.onError(`website cache: could not write ${entry.file}: ${(e as Error).message}`);
                await fs.promises.unlink(tmp).catch(() => {});
            }
        })();
        this.pendingWrites = Promise.all([this.pendingWrites, done]).then(() => {});
        return true;
    }

    public confirm(key: string, validatedAt: number, version: string | undefined): boolean {
        const entry = this.index.get(key);
        if (entry === undefined) {
            return false;
        }
        entry.meta.validatedAt = validatedAt;
        entry.meta.version = version;
        return true;
    }

    public delete(key: string): void {
        const entry = this.index.delete(key);
        if (entry !== undefined) {
            this.removeFile(entry.file);
        }
    }

    /** Deletes every entry whose metadata matches; returns how many. */
    public sweep(drop: (meta: BlobMeta) => boolean): number {
        const keys = [...this.index.entries()].filter(([, entry]) => drop(entry.meta)).map(([key]) => key);
        keys.forEach((key) => this.delete(key));
        return keys.length;
    }
}

type MemoryEntry = { meta: BlobMeta; body: Buffer };

/** Memory first; entries evicted from memory, or too big for it, go to disk; a disk entry that is used moves back. */
export class TieredBlobStore {
    public readonly memory: ByteLru<MemoryEntry>;
    private readonly maxMemoryEntryBytes: number;

    constructor(
        memoryBytes: number,
        public readonly disk: DiskBlobStore | undefined,
        private readonly stats: StoreStats = emptyStoreStats(),
    ) {
        this.maxMemoryEntryBytes = Math.min(memoryBytes / 8, MAX_ENTRY_BYTES_CAP);
        this.memory = new ByteLru(
            memoryBytes,
            disk === undefined ? undefined : (key, entry) => disk.put(key, entry.meta, entry.body),
        );
    }

    public lookup(key: string): BlobLookup | undefined {
        const inMemory = this.memory.get(key);
        if (inMemory !== undefined) {
            this.stats.memoryHits++;
            return { meta: inMemory.meta, load: () => Promise.resolve(inMemory.body) };
        }
        const onDisk = this.disk?.lookup(key);
        if (onDisk === undefined) {
            return undefined;
        }
        this.stats.diskHits++;
        return {
            meta: onDisk.meta,
            load: async () => {
                const body = await onDisk.load();
                if (body !== undefined && this.putInMemory(key, onDisk.meta, body)) {
                    this.stats.promotions++;
                    this.disk?.delete(key);
                }
                return body;
            },
        };
    }

    private putInMemory(key: string, meta: BlobMeta, body: Buffer): boolean {
        const bytes = body.length + key.length * 2 + MEMORY_ENTRY_OVERHEAD_BYTES;
        if (bytes > this.maxMemoryEntryBytes) {
            return false;
        }
        return this.memory.set(key, { meta: { ...meta }, body }, bytes);
    }

    public put(key: string, meta: BlobMeta, body: Buffer): boolean {
        this.disk?.delete(key);
        if (this.putInMemory(key, meta, body)) {
            return true;
        }
        this.memory.delete(key);
        return this.disk?.put(key, meta, body) ?? false;
    }

    public confirm(key: string, validatedAt: number, version: string | undefined): void {
        const inMemory = this.memory.get(key);
        if (inMemory !== undefined) {
            inMemory.meta.validatedAt = validatedAt;
            inMemory.meta.version = version;
            return;
        }
        this.disk?.confirm(key, validatedAt, version);
    }

    public delete(key: string): void {
        this.memory.delete(key);
        this.disk?.delete(key);
    }

    public sweep(drop: (meta: BlobMeta) => boolean): number {
        const keys = [...this.memory.entries()].filter(([, entry]) => drop(entry.meta)).map(([key]) => key);
        keys.forEach((key) => this.memory.delete(key));
        const swept = keys.length + (this.disk?.sweep(drop) ?? 0);
        this.stats.swept += swept;
        return swept;
    }

    public usage() {
        return {
            memoryEntries: this.memory.size,
            memoryBytes: this.memory.bytes,
            diskEntries: this.disk?.size ?? 0,
            diskBytes: this.disk?.bytes ?? 0,
        };
    }
}
