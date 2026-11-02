import type { NextcladeDatasetInfo } from './types.ts';
import type { ReferenceGenomesInfo } from '../../types/referencesGenomes.ts';

export const NEXTCLADE_DATASET_NAME_FIELD = 'nextcladeDatasetName';
export const NEXTCLADE_DATASET_TAG_FIELD = 'nextcladeDatasetTag';
export const NEXTCLADE_DATASET_SERVER_FIELD = 'nextcladeDatasetServer';

export function getNextcladeDatasets(
    referenceGenomesInfo: ReferenceGenomesInfo,
    details: Record<string, unknown>,
): NextcladeDatasetInfo[] {
    const segments = Object.keys(referenceGenomesInfo.segmentReferenceGenomes);
    const isMultiSegmented = segments.length > 1;
    const getStringFromDetails = (field: string, segment: string) => {
        const key = isMultiSegmented ? `${field}_${segment}` : field;
        const value = details[key];
        return typeof value === 'string' && value.length > 0 ? value : undefined;
    };

    return segments.flatMap((segment) => {
        const name = getStringFromDetails(NEXTCLADE_DATASET_NAME_FIELD, segment);
        if (name === undefined) {
            return [];
        }
        return [
            {
                segment,
                name,
                tag: getStringFromDetails(NEXTCLADE_DATASET_TAG_FIELD, segment),
                server: getStringFromDetails(NEXTCLADE_DATASET_SERVER_FIELD, segment),
            },
        ];
    });
}

const NEXTCLADE_WEB_URL = 'https://clades.nextstrain.org/';

export function getNextcladeDatasetUrl({ name, tag, server }: NextcladeDatasetInfo): string | undefined {
    if (tag === undefined || server === undefined) {
        return undefined;
    }
    const params = new URLSearchParams([
        ['dataset-server', server],
        ['dataset-name', name],
        ['dataset-tag', tag],
    ]);
    return `${NEXTCLADE_WEB_URL}?${params.toString()}`;
}
