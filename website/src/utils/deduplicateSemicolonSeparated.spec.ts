import { describe, expect, test } from 'vitest';

import { deduplicateSemicolonSeparated } from './deduplicateSemicolonSeparated';

describe('deduplicateSemicolonSeparated', () => {
    test('should deduplicate semicolon-separated values', () => {
        expect(deduplicateSemicolonSeparated('University A; University B; University A')).toBe(
            'University A; University B',
        );
    });

    test('should trim whitespace around entries', () => {
        expect(deduplicateSemicolonSeparated('  Uni A ;Uni B;  Uni A  ')).toBe('Uni A; Uni B');
    });

    test('should handle single value', () => {
        expect(deduplicateSemicolonSeparated('University A')).toBe('University A');
    });

    test('should handle empty string', () => {
        expect(deduplicateSemicolonSeparated('')).toBe('');
    });

    test('should handle null', () => {
        expect(deduplicateSemicolonSeparated(null)).toBe('');
    });

    test('should handle undefined', () => {
        expect(deduplicateSemicolonSeparated(undefined)).toBe('');
    });

    test('should filter out empty entries from consecutive semicolons', () => {
        expect(deduplicateSemicolonSeparated('Uni A;; Uni B')).toBe('Uni A; Uni B');
    });

    test('should preserve order of first occurrences', () => {
        expect(deduplicateSemicolonSeparated('C; A; B; A; C')).toBe('C; A; B');
    });
});
