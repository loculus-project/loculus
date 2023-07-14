import type { OptionList } from './config';

export type SequenceType =
    | { type: 'nucleotide'; aligned: boolean; name: 'main' }
    | { type: 'aminoAcid'; aligned: true; name: string };

export type Metadata = {
    name: string;
    type: 'string' | 'date' | 'integer' | 'pangoLineage';
    autocomplete?: boolean;
};

export type Filter = Metadata & {
    filter: string;
    label?: string;
    options?: OptionList;
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
    schema: {
        instanceName: string;
        metadata: Metadata[];
        tableColumns: string[];
        primaryKey: string;
    };
};
