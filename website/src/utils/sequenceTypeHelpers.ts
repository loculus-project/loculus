export type SequenceType =
    | { type: 'nucleotide'; aligned: boolean; name: SequenceName }
    | { type: 'aminoAcid'; aligned: true; name: SequenceName };
export type BaseType = SequenceType['type'];

export type SequenceName = {
    lapisName: string;
    label: string;
};

export const unalignedSequenceSegment = (segmentName: SequenceName): SequenceType => ({
    type: 'nucleotide',
    aligned: false,
    name: segmentName,
});

export const alignedSequenceSegment = (segmentName: SequenceName): SequenceType => ({
    type: 'nucleotide',
    aligned: true,
    name: segmentName,
});

export const geneSequence = (gene: SequenceName): SequenceType => ({
    type: 'aminoAcid',
    aligned: true,
    name: gene,
});
export const isUnalignedSequence = (type: SequenceType): boolean => type.type === 'nucleotide' && !type.aligned;
export const isAlignedSequence = (type: SequenceType): boolean => type.type === 'nucleotide' && type.aligned;
export const isGeneSequence = (gene: SequenceName, type: SequenceType): boolean =>
    type.type === 'aminoAcid' && type.name.lapisName === gene.lapisName;
