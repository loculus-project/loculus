import { describe, expect, it } from 'vitest';

import { DownloadUrlGenerator } from './DownloadUrlGenerator';
import { FieldFilterSet } from './SequenceFilters';

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
});
