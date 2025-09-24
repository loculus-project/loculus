export type DownloadDataType =
    | { type: 'metadata' }
    | {
          type: 'unalignedNucleotideSequences';
          segment?: string;
          includeRichFastaHeaders?: boolean;
      }
    | { type: 'alignedNucleotideSequences'; segment?: string; includeRichFastaHeaders?: boolean }
    | { type: 'alignedAminoAcidSequences'; gene: string; includeRichFastaHeaders?: boolean };

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
            return dataType.segment !== undefined
                ? `reference-aligned-nuc-${dataType.segment}`
                : 'reference-aligned-nuc';
        case 'alignedAminoAcidSequences':
            return `reference-aligned-aa-${dataType.gene}`;
    }
};
