import { describe, expect, it } from 'vitest';

import { FieldFilterSet } from './SequenceFilters';
import { MetadataFilterSchema } from '../../../utils/search';

describe('FieldFilterSet', () => {
    const emptyHiddenValues = {};
    const referenceGenomes = { nucleotideSequences: [], genes: [], insdcAccessionFull: [] };

    it('converts multi-entry accession strings into accession arrays without versions', () => {
        const schema = new MetadataFilterSchema([{ name: 'accession', type: 'string', multiEntry: true }]);
        const filterSet = new FieldFilterSet(
            schema,
            { accession: 'LOC_1 LOC_2.3' },
            emptyHiddenValues,
            referenceGenomes,
        );

        const params = filterSet.toApiParams();

        expect(params.accession).toEqual(['LOC_1', 'LOC_2']);
    });

    it('converts generic multi-entry fields into arrays', () => {
        const schema = new MetadataFilterSchema([{ name: 'sampleId', type: 'string', multiEntry: true }]);
        const filterSet = new FieldFilterSet(schema, { sampleId: 'a,b; c' }, emptyHiddenValues, referenceGenomes);

        const params = filterSet.toApiParams();

        expect(params.sampleId).toEqual(['a', 'b', 'c']);
    });
});
