export type SequenceType =
    | { type: 'nucleotide'; aligned: boolean; name: SegmentOrGeneInfo }
    | { type: 'aminoAcid'; aligned: true; name: SegmentOrGeneInfo };
export type BaseType = SequenceType['type'];

export type SegmentOrGeneInfo = {
    lapisName: string;
    label: string;
};

export function getMultiPathogenNucleotideSequenceNames(nucleotideSequences: string[], suborganism: string) {
    return nucleotideSequences.length === 1
        ? [{ lapisName: suborganism, label: 'main' }]
        : nucleotideSequences.map((name) => getMultiPathogenSequenceName(name, suborganism));
}

export function getSinglePathogenSequenceName(name: string): SegmentOrGeneInfo {
    return {
        lapisName: name,
        label: name,
    };
}

export function getMultiPathogenSequenceName(name: string, suborganism: string): SegmentOrGeneInfo {
    return {
        lapisName: `${suborganism}-${name}`,
        label: name,
    };
}

export function isMultiSegmented(nucleotideSegmentNames: unknown[]) {
    return nucleotideSegmentNames.length > 1;
}

export const unalignedSequenceSegment = (segmentOrGeneInfo: SegmentOrGeneInfo): SequenceType => ({
    type: 'nucleotide',
    aligned: false,
    name: segmentOrGeneInfo,
});

export const alignedSequenceSegment = (segmentOrGeneInfo: SegmentOrGeneInfo): SequenceType => ({
    type: 'nucleotide',
    aligned: true,
    name: segmentOrGeneInfo,
});

export const geneSequence = (segmentOrGeneInfo: SegmentOrGeneInfo): SequenceType => ({
    type: 'aminoAcid',
    aligned: true,
    name: segmentOrGeneInfo,
});
export const isUnalignedSequence = (type: SequenceType): boolean => type.type === 'nucleotide' && !type.aligned;
export const isAlignedSequence = (type: SequenceType): boolean => type.type === 'nucleotide' && type.aligned;
export const isGeneSequence = (segmentOrGeneInfo: SegmentOrGeneInfo, type: SequenceType): boolean =>
    type.type === 'aminoAcid' && type.name.lapisName === segmentOrGeneInfo.lapisName;
