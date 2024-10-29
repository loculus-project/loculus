export type DownloadDataType =
    | { type: 'metadata' }
    | { type: 'unalignedNucleotideSequences'; segment?: string }
    | { type: 'alignedNucleotideSequences'; segment?: string }
    | { type: 'alignedAminoAcidSequences'; gene: string };

/**
 * Get a shortened kebab-case datatype including the gene and sequence as well.
 */
export const dataTypeForFilename = (dataType: DownloadDataType): string => {
    switch (dataType.type) {
        case 'metadata':
            return 'metadata';
        case 'unalignedNucleotideSequences':
            // segment is undefined in case of single segmented (not e.g. main)
            return dataType.segment !== undefined ? `nuc-${dataType.segment}` : 'nuc';
        case 'alignedNucleotideSequences':
            return dataType.segment !== undefined ? `aligned-nuc-${dataType.segment}` : 'aligned-nuc';
        case 'alignedAminoAcidSequences':
            return `aligned-aa-${dataType.gene}`;
    }
};

/**
 * Get the LAPIS endpoint where to download this data type from.
 */
export const getEndpoint = (dataType: DownloadDataType) => {
    const segmentPath = (segment?: string) => (segment !== undefined ? `/${segment}` : '');

    switch (dataType.type) {
        case 'metadata':
            return '/sample/details';
        case 'unalignedNucleotideSequences':
            return '/sample/unalignedNucleotideSequences' + segmentPath(dataType.segment);
        case 'alignedNucleotideSequences':
            return '/sample/alignedNucleotideSequences' + segmentPath(dataType.segment);
        case 'alignedAminoAcidSequences':
            return `/sample/alignedAminoAcidSequences/${dataType.gene}`;
    }
};
