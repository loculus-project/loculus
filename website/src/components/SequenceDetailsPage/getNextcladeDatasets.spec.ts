import { describe, expect, test } from 'vitest';

import { getNextcladeDatasets, getNextcladeDatasetUrl } from './getNextcladeDatasets';
import {
    MULTI_SEG_SINGLE_REF_REFERENCEGENOMES,
    SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
} from '../../types/referenceGenomes.spec.ts';

describe('getNextcladeDatasets', () => {
    test('reads unsuffixed fields for a single segment', () => {
        const result = getNextcladeDatasets(SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES, {
            nextcladeDatasetName: 'nextstrain/mpox/all-clades',
            nextcladeDatasetTag: '2025-01-01--00-00-00Z',
            nextcladeDatasetServer: 'https://data.clades.nextstrain.org/v3/',
        });

        expect(result).toStrictEqual([
            {
                segment: 'main',
                name: 'nextstrain/mpox/all-clades',
                tag: '2025-01-01--00-00-00Z',
                server: 'https://data.clades.nextstrain.org/v3/',
            },
        ]);
    });

    test('reads segment-suffixed fields and skips segments without a dataset', () => {
        const result = getNextcladeDatasets(MULTI_SEG_SINGLE_REF_REFERENCEGENOMES, {
            /* eslint-disable @typescript-eslint/naming-convention */
            nextcladeDatasetName_S: 'datasetS',
            nextcladeDatasetTag_S: 'tagS',
            nextcladeDatasetServer_S: null,
            nextcladeDatasetName_L: null,
            nextcladeDatasetTag_L: null,
            /* eslint-enable @typescript-eslint/naming-convention */
        });

        expect(result).toStrictEqual([{ segment: 'S', name: 'datasetS', tag: 'tagS', server: undefined }]);
    });

    test('returns an empty list when the fields are absent', () => {
        expect(getNextcladeDatasets(SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES, {})).toStrictEqual([]);
    });
});

describe('getNextcladeDatasetUrl', () => {
    test('builds the pathogen.json url', () => {
        expect(
            getNextcladeDatasetUrl({ segment: 'main', name: 'a/b', tag: 't', server: 'https://example.com/' }),
        ).toBe('https://example.com/a/b/t/pathogen.json');
    });

    test('returns undefined when tag or server are missing', () => {
        expect(getNextcladeDatasetUrl({ segment: 'main', name: 'a/b', tag: 't' })).toBeUndefined();
        expect(getNextcladeDatasetUrl({ segment: 'main', name: 'a/b', server: 'https://example.com' })).toBeUndefined();
    });
});
