export type BaseType = 'nucleotide' | 'aminoAcid';

export type SequenceType =
    | { type: 'nucleotide'; aligned: boolean; name: 'main' }
    | { type: 'aminoAcid'; aligned: true; name: string };

export type Metadata = {
    name: string;
    type: 'string' | 'date' | 'integer' | 'pango_lineage';
    autocomplete?: boolean;
};

export type Filter = Metadata & {
    filter: string;
    label?: string;
};

type NamedSequence = {
    name: string;
    sequence: string;
};

export type ReferenceGenomes = {
    nucleotideSequences: NamedSequence[];
    genes: NamedSequence[];
};

export type Config = {
    lapisHost: string;
    backendUrl: string;
    schema: {
        instanceName: string;
        metadata: Metadata[];
        tableColumns: string[];
        primaryKey: string;
    };
};

export type MutationProportionCount = {
    mutation: string;
    proportion: number;
    count: number;
};

export type InsertionCount = {
    insertion: string;
    count: number;
};
