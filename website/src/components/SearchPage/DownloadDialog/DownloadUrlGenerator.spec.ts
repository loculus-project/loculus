import { describe, expect, it } from 'vitest';

import { DownloadUrlGenerator } from './DownloadUrlGenerator';
import { FieldFilterSet } from './SequenceFilters';
import type { FieldValues, Metadata } from '../../../types/config.ts';
import { MetadataFilterSchema } from '../../../utils/search.ts';

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
    it('converts null single values to empty strings', () => {
        const filter = makeFieldFilterSet({ field1: null }, [{ name: 'field1', type: 'string' as const }]);
        const params = filter.toUrlSearchParams();
        expect(params).toContainEqual(['field1', '']);
    });

    it('converts null values in arrays to empty strings', () => {
        const filter = makeFieldFilterSet({ field1: ['value1', null, 'value2'] }, [
            { name: 'field1', type: 'string' as const },
        ]);
        const params = filter.toUrlSearchParams();
        expect(params).toContainEqual(['field1', ['value1', '', 'value2']]);
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

    it('includes null field values as empty string params in download URL', () => {
        const generator = new DownloadUrlGenerator(organism, lapisUrl, dataUseTermsEnabled);
        const filter = makeFieldFilterSet({ field1: null }, [{ name: 'field1', type: 'string' as const }]);

        const result = generator.generateDownloadUrl(filter, {
            dataType: { type: 'metadata', fields: [] },
            includeRestricted: false,
            compression: undefined,
        });

        expect(result.params.get('field1')).toBe('');
    });
});
