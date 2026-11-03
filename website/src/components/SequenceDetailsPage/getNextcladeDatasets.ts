import type { NextcladeDatasetInfo } from './types.ts';
import type { ReferenceGenomesInfo } from '../../types/referencesGenomes.ts';

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
        const name = getStringFromDetails('nextcladeDatasetName', segment);
        if (name === undefined) {
            return [];
        }
        return [
            {
                segment,
                name,
                tag: getStringFromDetails('nextcladeDatasetTag', segment),
                server: getStringFromDetails('nextcladeDatasetServer', segment),
            },
        ];
    });
}

export function getNextcladeDatasetUrl({ name, tag, server }: NextcladeDatasetInfo): string | undefined {
    if (tag === undefined || server === undefined) {
        return undefined;
    }
    const params = new URLSearchParams([
        ['dataset-server', server],
        ['dataset-name', name],
        ['dataset-tag', tag],
    ]);
    return `https://clades.nextstrain.org/?${params.toString()}`;
}
