export type ReferenceGenomes = {
    nucleotideSequences: NamedSequence[];
    genes: NamedSequence[];
};

export type NamedSequence = {
    name: string;
    sequence: string;
};
