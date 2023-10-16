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

export interface SequenceVersion {
    sequenceId: number;
    version: number;
}

export type SequenceDetails = {
    [otherDetails: string | number | symbol]: unknown;
    accession?: string;
    genbankAccession?: string;
    sraAccession?: string;
    gisaidEpiIsl?: string;
    date?: string;
    country?: string;
    region?: string;
};

/**
 * Types for datasets and citations.
 **/

export enum AccessionType {
    pathoplexus = 'Pathoplexus',
    genbank = 'GenBank',
    sra = 'SRA',
    gisaid = 'GISAID',
}

export type DatasetRecord = {
    accession?: string;
    type?: AccessionType[keyof AccessionType];
};

export type Dataset = {
    datasetId: string;
    datasetDOI?: string;
    datasetVersion: string;
    name: string;
    description?: string;
    createdAt: string;
    createdBy: string;
    records?: DatasetRecord[];
};

export type AccessionCitation = {
    datasetId: string;
    date: string;
};

export type DatasetCitationResults = {
    sequenceId: string;
    citations: AccessionCitation[];
};
