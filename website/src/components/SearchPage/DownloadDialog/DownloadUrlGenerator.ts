import kebabCase from 'just-kebab-case';

import { getEndpoint, dataTypeForFilename, type DownloadDataType } from './DownloadDataType.ts';
import type { SequenceFilter } from './SequenceFilters.tsx';
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
    /**
     * Create new DownloadUrlGenerator with the given properties.
     * @param organism The organism, will be part of the filename.
     * @param lapisUrl The lapis API URL for downloading.
     * @param dataUseTermsEnabled If false, the downloaded URLs won't include any data use terms related settings.
     */
    constructor(
        private readonly organism: string,
        private readonly lapisUrl: string,
        private readonly dataUseTermsEnabled: boolean,
    ) {}

    public generateDownloadUrl(downloadParameters: SequenceFilter, option: DownloadOption) {
        const baseUrl = `${this.lapisUrl}${getEndpoint(option.dataType)}`;
        const params = new URLSearchParams();
        const excludedParams = new Set<string>();

        params.set('downloadAsFile', 'true');
        params.set('downloadFileBasename', this.generateFilename(option.dataType));

        excludedParams.add(VERSION_STATUS_FIELD);
        excludedParams.add(IS_REVOCATION_FIELD);
        if (!option.includeOldData) {
            params.set(VERSION_STATUS_FIELD, versionStatuses.latestVersion);
            params.set(IS_REVOCATION_FIELD, 'false');
        }
        if (!option.includeRestricted && this.dataUseTermsEnabled) {
            params.set('dataUseTerms', 'OPEN');
            excludedParams.add('dataUseTerms');
        }

        if (option.dataType.type === 'metadata') {
            params.set('dataFormat', metadataDefaultDownloadDataFormat);
        }
        if (option.compression !== undefined) {
            params.set('compression', option.compression);
        }

        downloadParameters
            .toUrlSearchParams()
            .filter(([name]) => !excludedParams.has(name))
            .forEach(([name, value]) => {
                if (value.length > 0) {
                    params.append(name, value);
                }
            });

        return {
            url: `${baseUrl}?${params}`,
            baseUrl,
            params,
        };
    }

    private generateFilename(downloadDataType: DownloadDataType): string {
        const organism = kebabCase(this.organism);
        const dataType = dataTypeForFilename(downloadDataType);
        const timestamp = new Date().toISOString().slice(0, 16).replace(':', '');
        return `${organism}_${dataType}_${timestamp}`;
    }
}
