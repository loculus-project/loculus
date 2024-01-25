export type SequenceType =
    | { type: 'nucleotide'; aligned: boolean; name: string }
    | { type: 'aminoAcid'; aligned: true; name: string };
export type BaseType = SequenceType['type'];

export const unalignedSequenceSegment = (segmentName: string): SequenceType => ({
    type: 'nucleotide',
    aligned: false,
    name: segmentName,
});

export const alignedSequenceSegment = (segmentName: string): SequenceType => ({
    type: 'nucleotide',
    aligned: true,
    name: segmentName,
});

export const geneSequence = (gene: string): SequenceType => ({
    type: 'aminoAcid',
    aligned: true,
    name: gene,
});
export const isUnalignedSequence = (type: SequenceType): boolean => type.type === 'nucleotide' && !type.aligned;
export const isAlignedSequence = (type: SequenceType): boolean => type.type === 'nucleotide' && type.aligned;
export const isGeneSequence = (gene: string, type: SequenceType): boolean =>
    type.type === 'aminoAcid' && type.name === gene;
