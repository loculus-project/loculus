import { IS_REVOCATION_FIELD, metadataDefaultDownloadDataFormat, VERSION_STATUS_FIELD } from '../../../settings.ts';
import type { FilterValue, MutationFilter } from '../../../types/config.ts';
import { siloVersionStatuses } from '../../../types/lapis.ts';

export type DownloadDataType =
    | { type: 'metadata' }
    | { type: 'unalignedNucleotideSequences'; segment: string | undefined }
    | { type: 'alignedNucleotideSequences'; segment: string | undefined }
    | { type: 'alignedAminoAcidSequences'; gene: string };

export type DownloadOption = {
    includeOldData: boolean;
    includeRestricted: boolean;
    dataType: DownloadDataType;
};

export const generateDownloadUrl = (
    metadataFilter: FilterValue[],
    mutationFilter: MutationFilter,
    option: DownloadOption,
    lapisUrl: string,
) => {
    const baseUrl = `${lapisUrl}${getEndpoint(option.dataType)}`;
    const params = new URLSearchParams();
    // TODO(#848)
    // params.set('downloadAsFile', 'true');
    if (!option.includeOldData) {
        params.set(VERSION_STATUS_FIELD, siloVersionStatuses.latestVersion);
        params.set(IS_REVOCATION_FIELD, 'false');
    }
    if (!option.includeRestricted) {
        // TODO(#852) Filter for sequences with an open Data Use Term.
    }
    if (option.dataType.type === 'metadata') {
        params.set('dataFormat', metadataDefaultDownloadDataFormat);
    }
    for (const { name, filterValue } of metadataFilter) {
        if (filterValue.trim().length > 0) {
            params.set(name, filterValue);
        }
    }
    if (mutationFilter.nucleotideMutationQueries !== undefined) {
        params.set('nucleotideMutations', mutationFilter.nucleotideMutationQueries.join(','));
    }
    if (mutationFilter.aminoAcidMutationQueries !== undefined) {
        params.set('aminoAcidMutations', mutationFilter.aminoAcidMutationQueries.join(','));
    }
    if (mutationFilter.nucleotideInsertionQueries !== undefined) {
        params.set('nucleotideInsertions', mutationFilter.nucleotideInsertionQueries.join(','));
    }
    if (mutationFilter.aminoAcidInsertionQueries !== undefined) {
        params.set('aminoAcidInsertions', mutationFilter.aminoAcidInsertionQueries.join(','));
    }
    return `${baseUrl}?${params}`;
};

const getEndpoint = (dataType: DownloadDataType) => {
    switch (dataType.type) {
        case 'metadata':
            return '/sample/details';
        case 'unalignedNucleotideSequences':
            return '/sample/unalignedNucleotideSequences' + segmentPathIfDefined(dataType.segment);
        case 'alignedNucleotideSequences':
            return '/sample/alignedNucleotideSequences' + segmentPathIfDefined(dataType.segment);
        case 'alignedAminoAcidSequences':
            return '/sample/alignedAminoAcidSequences' + segmentPathIfDefined(dataType.gene);
    }
};

const segmentPathIfDefined = (segment: string | undefined) => {
    if (segment === undefined) {
        return '';
    }
    return `/${segment}`;
};
