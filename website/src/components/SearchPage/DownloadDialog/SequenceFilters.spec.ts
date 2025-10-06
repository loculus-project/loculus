import { describe, expect, test } from 'vitest';

import { FieldFilterSet } from './SequenceFilters';
import { SINGLE_REFERENCE } from '../../../types/referencesGenomes';
import { MetadataFilterSchema } from '../../../utils/search';

describe('FieldFilterSet', () => {
    test('should handle array values with enableSubstringSearch correctly', () => {
        // Create a metadata schema with a field that has enableSubstringSearch
        const metadataSchema = [
            {
                name: 'authorAffiliations',
                displayName: 'Author affiliations',
                type: 'string' as const,
                autocomplete: true,
                substringSearch: true,
                generateIndex: true,
            },
        ];

        const filterSchema = new MetadataFilterSchema(metadataSchema);

        // Create field values with an array value (multi-select scenario)
        const fieldValues = {
            authorAffiliations: ['University of Example', 'Research Institute'],
        };

        const hiddenFieldValues = {};
        const referenceGenomeLightweightSchema = {
            [SINGLE_REFERENCE]: {
                nucleotideSegmentNames: [],
                geneNames: [],
                insdcAccessionFull: [],
            },
        };

        const filterSet = new FieldFilterSet(
            filterSchema,
            fieldValues,
            hiddenFieldValues,
            referenceGenomeLightweightSchema,
        );

        // This should not throw an error
        expect(() => filterSet.toApiParams()).not.toThrow();

        // Verify the result contains the regex versions
        const apiParams = filterSet.toApiParams();
        expect(apiParams['authorAffiliations.regex']).toEqual(['(?i)University of Example', '(?i)Research Institute']);
        expect(apiParams.authorAffiliations).toBeUndefined();
    });

    test('should handle string values with enableSubstringSearch correctly', () => {
        const metadataSchema = [
            {
                name: 'country',
                displayName: 'Country',
                type: 'string' as const,
                substringSearch: true,
                generateIndex: true,
            },
        ];

        const filterSchema = new MetadataFilterSchema(metadataSchema);

        // Create field values with a string value
        const fieldValues = {
            country: 'United States',
        };

        const hiddenFieldValues = {};
        const referenceGenomeLightweightSchema = {
            [SINGLE_REFERENCE]: {
                nucleotideSegmentNames: [],
                geneNames: [],
                insdcAccessionFull: [],
            },
        };

        const filterSet = new FieldFilterSet(
            filterSchema,
            fieldValues,
            hiddenFieldValues,
            referenceGenomeLightweightSchema,
        );

        // This should not throw an error
        expect(() => filterSet.toApiParams()).not.toThrow();

        // Verify the result contains the regex version
        const apiParams = filterSet.toApiParams();
        expect(apiParams['country.regex']).toBe('(?i)United States');
        expect(apiParams.country).toBeUndefined();
    });
});
