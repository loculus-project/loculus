import type { SequenceType } from '../types';

export const unalignedSequence: SequenceType = { type: 'nucleotide', aligned: false, name: 'main' };
export const alignedSequence: SequenceType = { type: 'nucleotide', aligned: true, name: 'main' };
export const geneSequence: (gene: string) => SequenceType = (gene) => ({
    type: 'aminoAcid',
    aligned: true,
    name: gene,
});
export const isUnalignedSequence = (type: SequenceType): boolean => type.type === 'nucleotide' && !type.aligned;
export const isAlignedSequence = (type: SequenceType): boolean => type.type === 'nucleotide' && type.aligned;
export const isGeneSequence = (gene: string, type: SequenceType): boolean =>
    type.type === 'aminoAcid' && type.name === gene;
