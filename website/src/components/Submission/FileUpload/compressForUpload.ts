const ALREADY_COMPRESSED = /\.(zst|xz|gz|zip|bz2|lzma)$/i;
const ZSTD_LEVEL = 12;

/**
 * `Zstd.load()` returns a cached singleton holding the compression stream state, so concurrent
 * compressions would interleave into one frame. Every call is chained onto the previous one.
 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Compresses a file with zstd and appends `.zst` to its name, which is how the backend detects
 * that it needs decompressing. Falls back to the original file if anything goes wrong.
 */
export async function compressForUpload(file: File): Promise<File> {
    const run = queue.then(() => compress(file));
    queue = run.catch(() => undefined);
    return run;
}

/** Loads the wasm module ahead of time so that submitting doesn't have to wait for it. */
export async function warmCompressor(): Promise<void> {
    try {
        const { Zstd } = await import('@hpcc-js/wasm-zstd');
        await Zstd.load();
    } catch (_error) {
        // Best effort; compressForUpload retries and falls back to no compression.
    }
}

async function compress(file: File): Promise<File> {
    try {
        if (ALREADY_COMPRESSED.test(file.name)) return file;

        const { Zstd } = await import('@hpcc-js/wasm-zstd');
        const zstd = await Zstd.load();
        zstd.resetCompression(ZSTD_LEVEL);
        zstd.setCompressionLevel(ZSTD_LEVEL);

        const parts: Uint8Array[] = [];
        const reader = file.stream().getReader();
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const compressed = zstd.compressChunk(value);
            if (compressed.length > 0) parts.push(compressed);
        }
        parts.push(zstd.compressEnd());

        return new File([concat(parts)], `${file.name}.zst`, { type: 'application/zstd' });
    } catch (_error) {
        return file;
    }
}

function concat(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const out = new Uint8Array(new ArrayBuffer(total));
    let offset = 0;
    for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
    }
    return out;
}
