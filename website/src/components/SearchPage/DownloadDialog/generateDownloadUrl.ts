import { IS_REVOCATION_FIELD, metadataDefaultDownloadDataFormat, VERSION_STATUS_FIELD } from '../../../settings.ts';
import { versionStatuses } from '../../../types/lapis.ts';

export type DownloadDataType =
    | { type: 'metadata' }
    | { type: 'unalignedNucleotideSequences'; segment: string | undefined }
    | { type: 'alignedNucleotideSequences'; segment: string | undefined }
    | { type: 'alignedAminoAcidSequences'; gene: string };

export type Compression = 'zstd' | 'gzip' | undefined;

export type DownloadOption = {
    includeOldData: boolean;
    includeRestricted: boolean;
    dataType: DownloadDataType;
    compression: Compression;
};

export const generateDownloadUrl = (
    lapisSearchParameters: Record<string, any>,
    option: DownloadOption,
    lapisUrl: string,
) => {
    const baseUrl = `${lapisUrl}${getEndpoint(option.dataType)}`;
    const params = new URLSearchParams();

    params.set('downloadAsFile', 'true');
    if (!option.includeOldData) {
        params.set(VERSION_STATUS_FIELD, versionStatuses.latestVersion);
        params.set(IS_REVOCATION_FIELD, 'false');
    }
    if (!option.includeRestricted) {
        params.set('dataUseTerms', 'OPEN');
    }
    if (option.dataType.type === 'metadata') {
        params.set('dataFormat', metadataDefaultDownloadDataFormat);
    }
    if (option.compression !== undefined) {
        params.set('compression', option.compression);
    }
    if (lapisSearchParameters.accession !== undefined) {
        for (const accession of lapisSearchParameters.accession) {
            params.append('accession', accession);
        }
    }

    const mutationKeys = ['nucleotideMutations', 'aminoAcidMutations', 'nucleotideInsertions', 'aminoAcidInsertions'];

    for (const [key, value] of Object.entries(lapisSearchParameters)) {
        // Skip accession and mutations
        if (key === 'accession' || mutationKeys.includes(key)) {
            continue;
        }
        const stringValue = String(value);
        const trimmedValue = stringValue.trim();
        if (trimmedValue.length > 0) {
            params.set(key, trimmedValue);
        }
    }

    mutationKeys.forEach((key) => {
        if (lapisSearchParameters[key] !== undefined) {
            params.set(key, lapisSearchParameters[key].join(','));
        }
    });

    return {
        url: `${baseUrl}?${params}`,
        baseUrl,
        params,
    };
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
