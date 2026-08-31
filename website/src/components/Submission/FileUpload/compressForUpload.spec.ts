import * as fzstd from 'fzstd';
import { describe, expect, it } from 'vitest';

import { compressForUpload } from './compressForUpload';

const bigTsv = ['id\tcountry\tdate', ...Array.from({ length: 5000 }, (_, i) => `s${i}\tSwitzerland\t2026-01-01`)].join(
    '\n',
);

describe('compressForUpload', () => {
    it('compresses a file and appends .zst, roundtripping to the original bytes', async () => {
        const original = new File([bigTsv], 'metadata.tsv');
        const compressed = await compressForUpload(original);

        expect(compressed.name).toBe('metadata.tsv.zst');
        expect(compressed.size).toBeLessThan(original.size / 5);

        const roundtripped = new TextDecoder().decode(fzstd.decompress(new Uint8Array(await compressed.arrayBuffer())));
        expect(roundtripped).toBe(bigTsv);
    });

    it('handles two files compressed concurrently', async () => {
        // Large enough that file.stream() yields many chunks, so the compressions interleave.
        const bigA = bigTsv.repeat(40);
        const bigB = bigTsv.replace(/Switzerland/g, 'Kenya').repeat(40);
        const a = new File([bigA], 'metadata.tsv');
        const b = new File([bigB], 'sequences.fasta');
        const [ca, cb] = await Promise.all([compressForUpload(a), compressForUpload(b)]);
        expect(new TextDecoder().decode(fzstd.decompress(new Uint8Array(await ca.arrayBuffer())))).toBe(await a.text());
        expect(new TextDecoder().decode(fzstd.decompress(new Uint8Array(await cb.arrayBuffer())))).toBe(await b.text());
    });

    it('leaves already-compressed files untouched', async () => {
        const file = new File([new Uint8Array([1, 2, 3])], 'sequences.fasta.zst');
        expect(await compressForUpload(file)).toBe(file);
    });
});
