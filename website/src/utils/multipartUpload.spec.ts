import { describe, expect, it } from 'vitest';

import { calculatePartSizeAndCount, splitFileIntoParts } from './multipartUpload';

describe('multipartUpload utilities', () => {
    describe('calculatePartSizeAndCount', () => {
        it('returns single part for small files', () => {
            const fileSize = 2 * 1024 * 1024; // 2 MB
            const result = calculatePartSizeAndCount(fileSize);

            expect(result.partCount).toBe(1);
            expect(result.partSize).toBe(10 * 1024 * 1024); // 10 MB target
        });

        it('calculates multiple parts for large files', () => {
            const fileSize = 30 * 1024 * 1024; // 30 MB
            const result = calculatePartSizeAndCount(fileSize);

            expect(result.partCount).toBe(3);
            expect(result.partSize).toBe(10 * 1024 * 1024); // 10 MB per part
        });

        it('increases part size when exceeding max parts limit', () => {
            const fileSize = 600 * 1024 * 1024 * 1024; // 600 GB (would be >10k parts at 10MB)
            const result = calculatePartSizeAndCount(fileSize);

            expect(result.partCount).toBe(10000); // MAX_PARTS
            expect(result.partSize).toBeGreaterThan(50 * 1024 * 1024); // Larger than target
        });
    });

    describe('splitFileIntoParts', () => {
        it('splits file into correct number of parts', () => {
            const content = 'x'.repeat(100);
            const file = new File([content], 'test.txt');
            const partSize = 30;

            const parts = splitFileIntoParts(file, partSize);

            expect(parts).toHaveLength(4); // 100 bytes / 30 = 4 parts (30, 30, 30, 10)
            expect(parts[0].size).toBe(30);
            expect(parts[1].size).toBe(30);
            expect(parts[2].size).toBe(30);
            expect(parts[3].size).toBe(10); // Last part is smaller
        });

        it('handles files smaller than part size', () => {
            const content = 'small';
            const file = new File([content], 'small.txt');
            const partSize = 100;

            const parts = splitFileIntoParts(file, partSize);

            expect(parts).toHaveLength(1);
            expect(parts[0].size).toBe(5);
        });
    });
});
