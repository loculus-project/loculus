import kebabCase from 'just-kebab-case';

import { getEndpoint, dataTypeForFilename, type DownloadDataType } from './DownloadDataType.ts';
import type { DownloadParameters } from './DownloadParameters.tsx';
import { IS_REVOCATION_FIELD, metadataDefaultDownloadDataFormat, VERSION_STATUS_FIELD } from '../../../settings.ts';
import { versionStatuses } from '../../../types/lapis.ts';

export type Compression = 'zstd' | 'gzip' | undefined;

export type DownloadOption = {
    includeOldData: boolean;
    includeRestricted: boolean;
    dataType: DownloadDataType;
    compression: Compression;
};

/**
 * Given download parameters and options, generates matching download URLs
 * from which the selected data can be downloaded.
 */
export class DownloadUrlGenerator {
    private readonly websiteName: string;
    private readonly organism: string;
    private readonly lapisUrl: string;

    /**
     * Create new DownloadUrlGenerator with the given properties.
     * @param websiteName The website name, will be part of the filename.
     * @param organism The organism, will be part of the filename.
     * @param lapisUrl The lapis API URL for downloading.
     */
    constructor(websiteName: string, organism: string, lapisUrl: string) {
        this.websiteName = websiteName;
        this.organism = organism;
        this.lapisUrl = lapisUrl;
    }

    public generateDownloadUrl(downloadParameters: DownloadParameters, option: DownloadOption) {
        const baseUrl = `${this.lapisUrl}${getEndpoint(option.dataType)}`;
        const params = new URLSearchParams();

        params.set('downloadAsFile', 'true');
        params.set('downloadFileBasename', this.generateFilename(option.dataType));
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

        switch (downloadParameters.type) {
            case 'filter':
                const lapisSearchParameters = downloadParameters.lapisSearchParameters;
                if (lapisSearchParameters.accession !== undefined) {
                    for (const accession of lapisSearchParameters.accession) {
                        params.append('accession', accession);
                    }
                }

                const mutationKeys = [
                    'nucleotideMutations',
                    'aminoAcidMutations',
                    'nucleotideInsertions',
                    'aminoAcidInsertions',
                ];

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
                break;
            case 'select':
                const sortedIds = Array.from(downloadParameters.selectedSequences).sort();
                sortedIds.forEach((accessionVersion) => {
                    params.append('accessionVersion', accessionVersion);
                });
                break;
        }

        return {
            url: `${baseUrl}?${params}`,
            baseUrl,
            params,
        };
    }

    private generateFilename(downloadDataType: DownloadDataType): string {
        const siteName = kebabCase(this.websiteName);
        const organism = kebabCase(this.organism);
        const dataType = dataTypeForFilename(downloadDataType);
        const timestamp = new Date().toISOString().slice(0, 16).replace('T', '').replace(':', '').replace('-', '');
        return `${siteName}_${organism}_${dataType}_${timestamp}`;
    }
}
