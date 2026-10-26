import { describe, expect, it } from 'vitest';

import { normalizeAccessionCase } from './normalizeAccessionCase.ts';

describe('normalizeAccessionCase', () => {
    it('uppercases the accession when the prefix is all-uppercase', () => {
        expect(normalizeAccessionCase('pp_00123', 'PP_')).toBe('PP_00123');
    });

    it('preserves an already-uppercase accession', () => {
        expect(normalizeAccessionCase('PP_00123', 'PP_')).toBe('PP_00123');
    });

    it('uppercases the suffix', () => {
        expect(normalizeAccessionCase('pp_0012a.1', 'PP_')).toBe('PP_0012A.1');
    });

    it('uppercases seqset accessions', () => {
        expect(normalizeAccessionCase('test_ss_abc123.1', 'TEST_')).toBe('TEST_SS_ABC123.1');
    });

    it('leaves the input untouched when the prefix contains lowercase letters', () => {
        expect(normalizeAccessionCase('loc_abc123.1', 'Loc_')).toBe('loc_abc123.1');
    });

    it('leaves the input untouched when the prefix has no letters at all', () => {
        expect(normalizeAccessionCase('abc123', '123_')).toBe('abc123');
    });
});
