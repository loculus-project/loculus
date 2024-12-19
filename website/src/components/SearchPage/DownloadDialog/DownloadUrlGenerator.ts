import kebabCase from 'just-kebab-case';

import { dataTypeForFilename, type DownloadDataType } from './DownloadDataType.ts';
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
    private readonly organism: string;
    private readonly lapisUrl: string;
    private readonly richFastaHeaderFields: string[];

    /**
     * Create new DownloadUrlGenerator with the given properties.
     * @param organism The organism, will be part of the filename.
     * @param lapisUrl The lapis API URL for downloading.
     */
    constructor(organism: string, lapisUrl: string, richFastaHeaderFields: string[] = ['accessionVersion']) {
        this.organism = organism;
        this.lapisUrl = lapisUrl;
        this.richFastaHeaderFields = richFastaHeaderFields;
    }

    public generateDownloadUrl(downloadParameters: SequenceFilter, option: DownloadOption) {
        const baseUrl = this.downloadEndpoint(option.dataType);
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

        if (
            option.dataType.type === 'unalignedNucleotideSequences' &&
            option.dataType.includeRichFastaHeaders === true
        ) {
            // get from config
            params.set('headerFields', this.richFastaHeaderFields.join(','));
        }

        downloadParameters.toUrlSearchParams().forEach(([name, value]) => {
            // Empty values are not allowed for e.g. aminoAcidInsertion filters
            // Hence, filter out empty values
            if (value !== '') {
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

    private readonly downloadEndpoint = (dataType: DownloadDataType) => {
        const segmentPath = (segment?: string) => (segment !== undefined ? '/' + segment : '');

        switch (dataType.type) {
            case 'metadata':
                return this.lapisUrl + '/sample/details';
            case 'unalignedNucleotideSequences':
                return dataType.includeRichFastaHeaders === true
                    ? '/' + this.organism + '/api/sequences' + segmentPath(dataType.segment)
                    : this.lapisUrl + '/sample/unalignedNucleotideSequences' + segmentPath(dataType.segment);
            case 'alignedNucleotideSequences':
                return this.lapisUrl + '/sample/alignedNucleotideSequences' + segmentPath(dataType.segment);
            case 'alignedAminoAcidSequences':
                return this.lapisUrl + '/sample/alignedAminoAcidSequences/' + dataType.gene;
        }
    };
}
