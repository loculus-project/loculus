import kebabCase from 'just-kebab-case';

import { dataTypeForFilename, type DownloadDataType } from './DownloadDataType.ts';
import type { SequenceFilter } from './SequenceFilters.tsx';
import { metadataDefaultDownloadDataFormat, sequenceDefaultDownloadDataFormat } from '../../../settings.ts';

export type Compression = 'zstd' | 'gzip' | undefined;

export type DownloadOption = {
    includeRestricted: boolean;
    dataType: DownloadDataType;
    compression: Compression;
    fields?: string[];
};

const downloadAsFile = 'downloadAsFile';
const dataFormat = 'dataFormat';

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
     * @param richFastaHeaderFields Forwarded to the /api/sequences endpoint to compute rich fasta headers.
     */
    constructor(
        private readonly organism: string,
        private readonly lapisUrl: string,
        private readonly dataUseTermsEnabled: boolean,
        private readonly richFastaHeaderFields?: string[],
    ) {}

    public generateDownloadUrl(downloadParameters: SequenceFilter, option: DownloadOption) {
        const baseUrl = this.downloadEndpoint(option.dataType);
        const params = new URLSearchParams();
        const excludedParams = new Set<string>();

        params.set(downloadAsFile, 'true');
        params.set('downloadFileBasename', this.generateFilename(option.dataType));

        if (!option.includeRestricted && this.dataUseTermsEnabled) {
            params.set('dataUseTerms', 'OPEN');
            excludedParams.add('dataUseTerms');
        }

        if (option.dataType.type === 'metadata') {
            params.set(dataFormat, metadataDefaultDownloadDataFormat);
        } else {
            params.set(dataFormat, sequenceDefaultDownloadDataFormat);
        }
        if (option.compression !== undefined) {
            params.set('compression', option.compression);
        }
        if (option.fields && option.fields.length > 0 && option.dataType.type === 'metadata') {
            params.set('fields', option.fields.join(','));
        }
        if (
            option.dataType.type === 'unalignedNucleotideSequences' &&
            option.dataType.includeRichFastaHeaders === true &&
            this.richFastaHeaderFields
        ) {
            params.delete(downloadAsFile);
            params.delete(dataFormat);
            for (const field of this.richFastaHeaderFields) {
                params.append('headerFields', field);
            }
            if (option.dataType.segment !== undefined) {
                params.set('segment', option.dataType.segment);
            }
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

    private downloadEndpoint(dataType: DownloadDataType) {
        const segmentPath = (segment?: string) => (segment !== undefined ? '/' + segment : '');

        switch (dataType.type) {
            case 'metadata':
                return this.lapisUrl + '/sample/details';
            case 'unalignedNucleotideSequences':
                return dataType.includeRichFastaHeaders === true
                    ? location.origin + '/' + this.organism + '/api/sequences'
                    : this.lapisUrl + '/sample/unalignedNucleotideSequences' + segmentPath(dataType.segment);
            case 'alignedNucleotideSequences':
                return this.lapisUrl + '/sample/alignedNucleotideSequences' + segmentPath(dataType.segment);
            case 'alignedAminoAcidSequences':
                return this.lapisUrl + '/sample/alignedAminoAcidSequences/' + dataType.gene;
        }
    }
}
