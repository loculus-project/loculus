import type { SegmentLapisNames } from '../../../utils/sequenceTypeHelpers';

export type DownloadDataType =
    | { type: 'metadata'; fields: string[] }
    | {
          type: 'unalignedNucleotideSequences';
          segmentLapisNames?: SegmentLapisNames;
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
            if (dataType.segment !== undefined) {
                return `nuc-${dataType.segment}`;
            }
            return dataType.segmentLapisNames !== undefined ? `nuc-${dataType.segmentLapisNames.name}` : 'nuc';
        case 'alignedNucleotideSequences':
            return dataType.segment !== undefined ? `aligned-nuc-${dataType.segment}` : 'aligned-nuc';
        case 'alignedAminoAcidSequences':
            return `aligned-aa-${dataType.gene}`;
    }
};
