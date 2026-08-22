import { describe, expect, test } from 'vitest';

import { getCitation } from './citationFormats';
import type { SeqSet } from '../../types/seqSetCitation';

const seqSetWithoutDoi: SeqSet = {
    seqSetId: 'PP_SS_1915',
    seqSetVersion: 1,
    name: 'My SeqSet',
    description: 'A test SeqSet',
    // Midday UTC so the year does not depend on the local timezone.
    createdAt: '2024-06-15T12:00:00Z',
    createdBy: 'testuser',
};

const seqSetWithDoi: SeqSet = { ...seqSetWithoutDoi, seqSetDOI: '10.62599/PP_SS_1915.1' };

const input = { databaseName: 'Pathoplexus', seqSetUrl: 'https://pathoplexus.org/seqsets/PP_SS_1915.1' };

describe('getCitation', () => {
    test('uses the SeqSet page URL when there is no DOI', () => {
        expect(getCitation('apa', { seqSet: seqSetWithoutDoi, ...input })).toBe(
            'SeqSet: My SeqSet. (2024). Pathoplexus. https://pathoplexus.org/seqsets/PP_SS_1915.1',
        );
        expect(getCitation('mla', { seqSet: seqSetWithoutDoi, ...input })).toBe(
            'SeqSet: My SeqSet. Pathoplexus, 2024. https://pathoplexus.org/seqsets/PP_SS_1915.1',
        );
    });

    test('prefers the DOI over the page URL', () => {
        expect(getCitation('apa', { seqSet: seqSetWithDoi, ...input })).toBe(
            'SeqSet: My SeqSet. (2024). Pathoplexus. https://doi.org/10.62599/PP_SS_1915.1',
        );
        expect(getCitation('mla', { seqSet: seqSetWithDoi, ...input })).toBe(
            'SeqSet: My SeqSet. Pathoplexus, 2024. https://doi.org/10.62599/PP_SS_1915.1',
        );
    });

    test('builds a BibTeX entry keyed on the accession version when there is no DOI', () => {
        expect(getCitation('bibtex', { seqSet: seqSetWithoutDoi, ...input })).toBe(
            [
                '@dataset{PP_SS_1915_1,',
                '\ttitle = {SeqSet: My SeqSet},',
                '\tjournal = {Pathoplexus},',
                '\tyear = {2024},',
                '\turl = {https://pathoplexus.org/seqsets/PP_SS_1915.1}',
                '}',
            ].join('\n'),
        );
    });

    test('adds a doi field and keys on the DOI when one exists', () => {
        expect(getCitation('bibtex', { seqSet: seqSetWithDoi, ...input })).toBe(
            [
                '@dataset{10_62599_PP_SS_1915_1,',
                '\ttitle = {SeqSet: My SeqSet},',
                '\tjournal = {Pathoplexus},',
                '\tyear = {2024},',
                '\turl = {https://doi.org/10.62599/PP_SS_1915.1},',
                '\tdoi = {10.62599/PP_SS_1915.1}',
                '}',
            ].join('\n'),
        );
    });
});
