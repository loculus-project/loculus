export type DownloadDataType =
    | { type: 'metadata' }
    | {
          type: 'unalignedNucleotideSequences';
          segment?: string;
          richFastaHeaders: IncludeRichFastaHeaders;
      }
    | { type: 'alignedNucleotideSequences'; segment?: string; richFastaHeaders: IncludeRichFastaHeaders }
    | { type: 'alignedAminoAcidSequences'; gene: string; richFastaHeaders: IncludeRichFastaHeaders };

type IncludeRichFastaHeaders =
    | {
          include: true;
          /** Use this fasta header template (or the default if undefined) */
          fastaHeaderOverride?: string;
      }
    | { include: false };

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
