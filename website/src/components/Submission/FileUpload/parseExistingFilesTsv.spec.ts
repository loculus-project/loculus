import { describe, it, expect } from 'vitest';

import { parseExistingFilesTsv } from './parseExistingFilesTsv';

const HEADER = 'id\tcategory\tfileId\tfileName';

describe('parseExistingFilesTsv', () => {
    it('groups files by submission id and category', () => {
        const content = [
            HEADER,
            'sample1\traw_reads\tfile-1\treads_R1.fastq',
            'sample1\traw_reads\tfile-2\treads_R2.fastq',
            'sample2\traw_reads\tfile-3\treads.fastq',
        ].join('\n');

        expect(parseExistingFilesTsv(content)).toEqual({
            sample1: {
                raw_reads: [
                    { fileId: 'file-1', name: 'reads_R1.fastq' },
                    { fileId: 'file-2', name: 'reads_R2.fastq' },
                ],
            },
            sample2: {
                raw_reads: [{ fileId: 'file-3', name: 'reads.fastq' }],
            },
        });
    });

    it('supports multiple categories for the same submission id', () => {
        const content = [
            HEADER,
            'sample1\traw_reads\tfile-1\treads.fastq',
            'sample1\tannotations\tfile-2\tann.gff',
        ].join('\n');

        expect(parseExistingFilesTsv(content)).toEqual({
            sample1: {
                raw_reads: [{ fileId: 'file-1', name: 'reads.fastq' }],
                annotations: [{ fileId: 'file-2', name: 'ann.gff' }],
            },
        });
    });

    it('is robust to reordered columns', () => {
        const content = ['fileName\tfileId\tcategory\tid', 'reads.fastq\tfile-1\traw_reads\tsample1'].join('\n');

        expect(parseExistingFilesTsv(content)).toEqual({
            sample1: { raw_reads: [{ fileId: 'file-1', name: 'reads.fastq' }] },
        });
    });

    it('returns an empty mapping for a header-only file', () => {
        expect(parseExistingFilesTsv(HEADER)).toEqual({});
    });

    it('throws when a required column is missing', () => {
        const content = ['id\tcategory\tfileId', 'sample1\traw_reads\tfile-1'].join('\n');

        expect(() => parseExistingFilesTsv(content)).toThrow(/missing required column\(s\): fileName/);
    });

    it('throws when a row has an empty value', () => {
        const content = [HEADER, 'sample1\traw_reads\t\treads.fastq'].join('\n');

        expect(() => parseExistingFilesTsv(content)).toThrow(/empty id, category, fileId or fileName/);
    });
});
