import { expect, test, describe } from 'vitest';

import { parseFasta } from './parseFasta';

describe('parseFasta', () => {
    test('should handle a single-line sequence', () => {
        const fastaStr = '>seq1\nATGCATGC\n';
        const result = parseFasta(fastaStr);
        expect(result.length).toBe(1);
        expect(result[0].name).toBe('seq1');
        expect(result[0].sequence).toBe('ATGCATGC');
    });

    test('should handle a multi-line sequence', () => {
        const fastaStr = '>seq1\nATGC\nATGC\n';
        const result = parseFasta(fastaStr);
        expect(result.length).toBe(1);
        expect(result[0].name).toBe('seq1');
        expect(result[0].sequence).toBe('ATGCATGC');
    });

    test('should handle multiple entries', () => {
        const fastaStr = '>seq1\nATGC\n>seq2\nGGCC\n';
        const result = parseFasta(fastaStr);
        expect(result.length).toBe(2);
        expect(result[0].name).toBe('seq1');
        expect(result[0].sequence).toBe('ATGC');
        expect(result[1].name).toBe('seq2');
        expect(result[1].sequence).toBe('GGCC');
    });

    test('should throw error when sequence line is encountered before name line', () => {
        const badFastaStr = 'ATGC\n>seq2\nGGCC\n';
        let errorWasThrown = false;
        try {
            parseFasta(badFastaStr);
        } catch (_) {
            errorWasThrown = true;
        }
        expect(errorWasThrown).toBe(true);
    });
});
