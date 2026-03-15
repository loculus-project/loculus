import { describe, expect, it } from 'vitest';

import { FieldFilterSet } from './SequenceFilters';
import type { FieldValues, Metadata, MultiFieldSearch } from '../../../types/config.ts';
import { MetadataFilterSchema } from '../../../utils/search.ts';

const makeFieldFilterSet = (
    fieldValues: FieldValues,
    metadataFields: Metadata[],
    multiFieldSearches: MultiFieldSearch[] = [],
) => {
    return new FieldFilterSet(
        new MetadataFilterSchema(metadataFields, multiFieldSearches),
        fieldValues,
        {},
        { nucleotideSegmentInfos: [], geneInfos: [] },
        {
            isMultiSegmented: false,
            segmentReferenceGenomes: {},
            segmentDisplayNames: {},
            useLapisMultiSegmentedEndpoint: false,
        },
    );
};

const identifierMfs: MultiFieldSearch = {
    name: 'identifier',
    displayName: 'Sample Identifier',
    fields: ['accessionVersion', 'submissionId'],
};

describe('FieldFilterSet.toApiParams — multi-field search advancedQuery', () => {
    it('generates advancedQuery when a multi-field search has a non-empty value', () => {
        const filter = makeFieldFilterSet({ identifier: 'test123' }, [], [identifierMfs]);
        const params = filter.toApiParams();
        expect(params.advancedQuery).toBe(
            "(accessionVersion.regex='(?i)test123' or submissionId.regex='(?i)test123')",
        );
    });

    it('does not produce advancedQuery when value is empty string', () => {
        const filter = makeFieldFilterSet({ identifier: '' }, [], [identifierMfs]);
        const params = filter.toApiParams();
        expect(params.advancedQuery).toBeUndefined();
    });

    it('does not produce advancedQuery when value is whitespace only', () => {
        const filter = makeFieldFilterSet({ identifier: '   ' }, [], [identifierMfs]);
        const params = filter.toApiParams();
        expect(params.advancedQuery).toBeUndefined();
    });

    it('does not produce advancedQuery when multi-field key is absent', () => {
        const filter = makeFieldFilterSet({}, [], [identifierMfs]);
        const params = filter.toApiParams();
        expect(params.advancedQuery).toBeUndefined();
    });

    it('trims surrounding whitespace from the search value', () => {
        const filter = makeFieldFilterSet({ identifier: '  acc123  ' }, [], [identifierMfs]);
        const params = filter.toApiParams();
        expect(params.advancedQuery).toBe(
            "(accessionVersion.regex='(?i)acc123' or submissionId.regex='(?i)acc123')",
        );
    });

    it('escapes single quotes so LAPIS query string literals remain valid', () => {
        const filter = makeFieldFilterSet({ identifier: "O'Connor" }, [], [identifierMfs]);
        const params = filter.toApiParams();
        // The single quote inside the value must be escaped as \' in the query
        expect(params.advancedQuery).toBe(
            "(accessionVersion.regex='(?i)O\\'Connor' or submissionId.regex='(?i)O\\'Connor')",
        );
    });

    it('escapes regex special characters in search values', () => {
        const filter = makeFieldFilterSet({ identifier: 'test.value' }, [], [identifierMfs]);
        const params = filter.toApiParams();
        expect(params.advancedQuery).toBe(
            "(accessionVersion.regex='(?i)test\\.value' or submissionId.regex='(?i)test\\.value')",
        );
    });

    it('combines multiple active multi-field searches with "and"', () => {
        const contributorMfs: MultiFieldSearch = {
            name: 'contributor',
            displayName: 'Contributor',
            fields: ['authors'],
        };
        const filter = makeFieldFilterSet(
            { identifier: 'acc123', contributor: 'Smith' },
            [],
            [identifierMfs, contributorMfs],
        );
        const params = filter.toApiParams();
        expect(params.advancedQuery).toBe(
            "(accessionVersion.regex='(?i)acc123' or submissionId.regex='(?i)acc123') and (authors.regex='(?i)Smith')",
        );
    });

    it('only produces advancedQuery for the active multi-field search when the other is empty', () => {
        const contributorMfs: MultiFieldSearch = {
            name: 'contributor',
            displayName: 'Contributor',
            fields: ['authors'],
        };
        const filter = makeFieldFilterSet(
            { identifier: 'acc123', contributor: '' },
            [],
            [identifierMfs, contributorMfs],
        );
        const params = filter.toApiParams();
        expect(params.advancedQuery).toBe(
            "(accessionVersion.regex='(?i)acc123' or submissionId.regex='(?i)acc123')",
        );
    });

    it('excludes multi-field search keys from the regular filter params', () => {
        const filter = makeFieldFilterSet(
            { identifier: 'test', country: 'Germany' },
            [{ name: 'country', type: 'string' as const }],
            [identifierMfs],
        );
        const params = filter.toApiParams();
        expect(params.identifier).toBeUndefined();
        expect(params.country).toBe('Germany');
    });
});
