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
    schema: {
        instanceName: string;
        metadata: Metadata[];
        tableColumns: string[];
        primaryKey: string;
    };
};

export type RuntimeConfig = {
    forClient: ClientConfig;
    forServer: ServerConfig;
};

export type ClientConfig = { discriminator: 'client' } & ServiceUrls;
export type ServerConfig = { discriminator: 'server' } & ServiceUrls;

export type ServiceUrls = {
    backendUrl: string;
    lapisUrl: string;
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

export type HeaderId = {
    sequenceId: number;
    version: number;
    customId: string;
};

/**
 * Types for datasets and citations.
 **/

export type Dataset = {
    datasetId: string;
    datasetDOI?: string;
    name: string;
    description?: string;
    version: string;
    createdBy: string;
    status: string;
    createdAt: string;
    lastModifiedDate: string;
    sequences?: DatasetAccession[];
};

export type DatasetAccession = {
    sequenceId: string;
    version?: number;
    genbankAccession?: string;
    sraAccession?: string;
};

export type DatasetAccessionResults = {
    [key: string]: any;
};

export type AccessionCitation = {
    datasetId: string;
    date: string;
};

export type DatasetCitationResults = {
    sequenceId: string;
    citations: AccessionCitation[];
};
