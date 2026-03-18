import { describe, expect, it } from 'vitest';

import { DownloadUrlGenerator } from './DownloadUrlGenerator';
import { FieldFilterSet } from './SequenceFilters';
import type { FieldValues, Metadata } from '../../../types/config.ts';
import { MetadataFilterSchema, NULL_QUERY_VALUE } from '../../../utils/search.ts';

const makeFieldFilterSet = (fieldValues: FieldValues, metadataFields: Metadata[]) => {
    return new FieldFilterSet(
        new MetadataFilterSchema(metadataFields),
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

describe('FieldFilterSet.toUrlSearchParams', () => {
    it('converts null single values to NULL_QUERY_VALUE', () => {
        const filter = makeFieldFilterSet({ field1: null }, [{ name: 'field1', type: 'string' as const }]);
        const params = filter.toUrlSearchParams();
        expect(params).toContainEqual(['field1', NULL_QUERY_VALUE]);
    });

    it('converts null values in arrays to NULL_QUERY_VALUE param and keeps non-null values', () => {
        const filter = makeFieldFilterSet({ field1: ['value1', null, 'value2'] }, [
            { name: 'field1', type: 'string' as const },
        ]);
        const params = filter.toUrlSearchParams();
        expect(params).toContainEqual(['field1', ['value1', NULL_QUERY_VALUE, 'value2']]);
    });

    it('does not convert regular string values', () => {
        const filter = makeFieldFilterSet({ field1: 'someValue' }, [{ name: 'field1', type: 'string' as const }]);
        const params = filter.toUrlSearchParams();
        expect(params).toContainEqual(['field1', 'someValue']);
    });
});

describe('DownloadUrlGenerator', () => {
    const organism = 'test-organism';
    const lapisUrl = 'https://example.com/api';
    const dataUseTermsEnabled = true;

    it('includes selected fields in the URL for metadata downloads', () => {
        const generator = new DownloadUrlGenerator(organism, lapisUrl, dataUseTermsEnabled);

        const result = generator.generateDownloadUrl(FieldFilterSet.empty(), {
            dataType: { type: 'metadata', fields: ['field1', 'field2', 'field3'] },
            includeRestricted: false,
            compression: undefined,
        });

        expect(result.params.get('fields')).toBe('field1,field2,field3');
    });

    it('does not include fields parameter for non-metadata downloads', () => {
        const generator = new DownloadUrlGenerator(organism, lapisUrl, dataUseTermsEnabled);

        const result = generator.generateDownloadUrl(FieldFilterSet.empty(), {
            dataType: { type: 'unalignedNucleotideSequences', richFastaHeaders: { include: false } },
            includeRestricted: false,
            compression: undefined,
        });

        expect(result.params.has('fields')).toBe(false);
    });

    it('does not include fields parameter when fields array is empty', () => {
        const generator = new DownloadUrlGenerator(organism, lapisUrl, dataUseTermsEnabled);

        const result = generator.generateDownloadUrl(FieldFilterSet.empty(), {
            dataType: { type: 'metadata', fields: [] },
            includeRestricted: false,
            compression: undefined,
        });

        expect(result.params.has('fields')).toBe(false);
    });

    it('includes null field values as isNull params in download URL', () => {
        const generator = new DownloadUrlGenerator(organism, lapisUrl, dataUseTermsEnabled);
        const filter = makeFieldFilterSet({ field1: null }, [{ name: 'field1', type: 'string' as const }]);

        const result = generator.generateDownloadUrl(filter, {
            dataType: { type: 'metadata', fields: [] },
            includeRestricted: false,
            compression: undefined,
        });

        expect(result.params.get('field1.isNull')).toBe('true');
        expect(result.params.has('field1')).toBe(false);
    });
});

describe('modifyParamsForLapisGetRequest (via generateDownloadUrl)', () => {
    const organism = 'test-organism';
    const lapisUrl = 'https://example.com/api';
    const dataUseTermsEnabled = false;
    const metadataDownloadOption = {
        dataType: { type: 'metadata' as const, fields: [] },
        includeRestricted: true,
        compression: undefined,
    };

    const generate = (fieldValues: FieldValues, metadataFields: Metadata[]) => {
        const generator = new DownloadUrlGenerator(organism, lapisUrl, dataUseTermsEnabled);
        const filter = makeFieldFilterSet(fieldValues, metadataFields);
        return generator.generateDownloadUrl(filter, metadataDownloadOption).params;
    };

    it('passes through a regular string value as a normal param', () => {
        const params = generate({ field1: 'someValue' }, [{ name: 'field1', type: 'string' as const }]);
        expect(params.get('field1')).toBe('someValue');
    });

    it('converts a single null value to a .isNull param', () => {
        const params = generate({ field1: null }, [{ name: 'field1', type: 'string' as const }]);
        expect(params.get('field1.isNull')).toBe('true');
        expect(params.has('field1')).toBe(false);
    });

    it('passes through an array of non-null values as multiple params', () => {
        const params = generate({ field1: ['val1', 'val2'] }, [{ name: 'field1', type: 'string' as const }]);
        expect(params.getAll('field1')).toEqual(['val1', 'val2']);
        expect(params.has('advancedQuery')).toBe(false);
    });

    it('converts an array containing null to an advancedQuery clause and escapes single quotes', () => {
        const params = generate({ field1: [null, "O'brian"] }, [{ name: 'field1', type: 'string' as const }]);
        expect(params.has('field1')).toBe(false);
        expect(params.get('advancedQuery')).toBe("isNull(field1) OR field1='O\\'brian'");
    });

    it('handles an array with only null as an advancedQuery with just isNull', () => {
        const params = generate({ field1: [null] }, [{ name: 'field1', type: 'string' as const }]);
        expect(params.has('field1')).toBe(false);
        expect(params.get('advancedQuery')).toBe('isNull(field1)');
    });

    it('ORs advancedQuery clauses when multiple fields have null values', () => {
        const params = generate({ field1: [null, 'val1'], field2: [null] }, [
            { name: 'field1', type: 'string' as const },
            { name: 'field2', type: 'string' as const },
        ]);
        expect(params.has('field1')).toBe(false);
        expect(params.has('field2')).toBe(false);
        expect(params.get('advancedQuery')).toBe("(isNull(field1) OR field1='val1') OR (isNull(field2))");
    });
});
