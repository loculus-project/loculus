export type SequenceType =
    | { type: 'nucleotide'; aligned: boolean; name: SequenceName }
    | { type: 'aminoAcid'; aligned: true; name: SequenceName };
export type BaseType = SequenceType['type'];

export type SequenceName = {
    lapisName: string;
    label: string;
};

export function getMultiPathogenNucleotideSequenceNames(nucleotideSequences: string[], suborganism: string) {
    return nucleotideSequences.length === 1
        ? [{ lapisName: suborganism, label: 'main' }]
        : nucleotideSequences.map((name) => getMultiPathogenSequenceName(name, suborganism));
}

export function getSinglePathogenSequenceName(name: string): SequenceName {
    return {
        lapisName: name,
        label: name,
    };
}

export function getMultiPathogenSequenceName(name: string, suborganism: string): SequenceName {
    return {
        lapisName: `${suborganism}-${name}`,
        label: name,
    };
}

export function isMultiSegmented(nucleotideSegmentNames: unknown[]) {
    return nucleotideSegmentNames.length > 1;
}

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
