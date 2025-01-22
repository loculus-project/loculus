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
    dataFormat: string | undefined;
};

/**
 * Given download parameters and options, generates matching download URLs
 * from which the selected data can be downloaded.
 */
export class DownloadUrlGenerator {
    private readonly organism: string;
    private readonly lapisUrl: string;

    /**
     * Create new DownloadUrlGenerator with the given properties.
     * @param organism The organism, will be part of the filename.
     * @param lapisUrl The lapis API URL for downloading.
     */
    constructor(organism: string, lapisUrl: string) {
        this.organism = organism;
        this.lapisUrl = lapisUrl;
    }

    public generateDownloadUrl(downloadParameters: SequenceFilter, option: DownloadOption) {
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
        if (option.dataType.type === 'metadata' ) {
            params.set('dataFormat', metadataDefaultDownloadDataFormat);
        } else {
            params.set('dataFormat', 'fasta');
        }
        if (option.compression !== undefined) {
            params.set('compression', option.compression);
        }

        if(option.dataFormat!==undefined){
            params.delete('dataFormat');
            params.set('dataFormat', option.dataFormat);
        }

        downloadParameters.toUrlSearchParams().forEach(([name, value]) => {
            params.append(name, value);
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
