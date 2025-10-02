export type SequenceType =
    | { type: 'nucleotide'; aligned: boolean; name: SegmentInfo }
    | { type: 'aminoAcid'; aligned: true; name: GeneInfo };
export type BaseType = SequenceType['type'];

export type SegmentInfo = {
    /** the segment name as it is called in LAPIS */
    lapisName: string;
    /** the segment name as it should be displayed in the UI */
    label: string;
};

export type GeneInfo = {
    /** the gene name as it is called in LAPIS */
    lapisName: string;
    /** the gene name as it should be displayed in the UI */
    label: string;
};

export function getMultiPathogenNucleotideSequenceNames(nucleotideSequences: string[], suborganism: string) {
    return nucleotideSequences.length === 1
        ? [{ lapisName: suborganism, label: 'main' }]
        : nucleotideSequences.map((name) => getMultiPathogenSequenceName(name, suborganism));
}

export function getSinglePathogenSequenceName(name: string): SegmentInfo | GeneInfo {
    return {
        lapisName: name,
        label: name,
    };
}

export function getMultiPathogenSequenceName(name: string, suborganism: string): SegmentInfo | GeneInfo {
    return {
        lapisName: `${suborganism}-${name}`,
        label: name,
    };
}

export function isMultiSegmented(nucleotideSegmentNames: unknown[]) {
    return nucleotideSegmentNames.length > 1;
}

export const unalignedSequenceSegment = (segmentInfo: SegmentInfo): SequenceType => ({
    type: 'nucleotide',
    aligned: false,
    name: segmentInfo,
});

export const alignedSequenceSegment = (segmentInfo: SegmentInfo): SequenceType => ({
    type: 'nucleotide',
    aligned: true,
    name: segmentInfo,
});

export const geneSequence = (geneInfo: GeneInfo): SequenceType => ({
    type: 'aminoAcid',
    aligned: true,
    name: geneInfo,
});
export const isUnalignedSequence = (type: SequenceType): boolean => type.type === 'nucleotide' && !type.aligned;
export const isAlignedSequence = (type: SequenceType): boolean => type.type === 'nucleotide' && type.aligned;
export const isGeneSequence = (segmentOrGeneInfo: SegmentInfo | GeneInfo, type: SequenceType): boolean =>
    type.type === 'aminoAcid' && type.name.lapisName === segmentOrGeneInfo.lapisName;
