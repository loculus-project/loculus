export type DownloadDataType =
    | { type: 'metadata' }
    | {
          type: 'unalignedNucleotideSequences';
          segment?: string;
          /**
           * - true: include rich FASTA headers as configured in the config
           * - string: use this string as the FASTA header template
           * - false or undefined: do not include rich FASTA headers
           */
          includeRichFastaHeaders?: boolean | string;
      }
    | { type: 'alignedNucleotideSequences'; segment?: string; includeRichFastaHeaders?: boolean | string }
    | { type: 'alignedAminoAcidSequences'; gene: string; includeRichFastaHeaders?: boolean | string };

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
