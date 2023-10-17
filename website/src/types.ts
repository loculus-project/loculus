import z from 'zod';

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

export type PangoLineage = string;

export type UnprocessedData = {
    sequenceId: number;
    version: number;
    data: {
        metadata: { [key in string]: string | number | PangoLineage | Date };
        unalignedNucleotideSequences: { [key in string]: string };
    };
};

export type Sequence = {
    sequenceId: number;
    version: number;
    data: any;
    errors?: any[];
    warnings?: any[];
};

const sequenceStatusNames = z.union([
    z.literal('RECEIVED'),
    z.literal('PROCESSING'),
    z.literal('NEEDS_REVIEW'),
    z.literal('REVIEWED'),
    z.literal('PROCESSED'),
    z.literal('SILO_READY'),
    z.literal('REVOKED_STAGING'),
]);
export type SequenceStatusNames = z.infer<typeof sequenceStatusNames>;
const statusThatAllowsReview = z.union([z.literal('NEEDS_REVIEW'), z.literal('PROCESSED')]);

const processingAnnotationSourceType = z.union([z.literal('Metadata'), z.literal('NucleotideSequence')]);
export type ProcessingAnnotationSourceType = z.infer<typeof processingAnnotationSourceType>;
const processingAnnotation = z.object({
    source: z.array(
        z.object({
            name: z.string(),
            type: processingAnnotationSourceType,
        }),
    ),
    message: z.string(),
});

export type ProcessingAnnotation = z.infer<typeof processingAnnotation>;

export const metadataField = z.union([z.string(), z.number(), z.date(), z.string()]);
export type MetadataField = z.infer<typeof metadataField>;
export const sequenceReview = z.object({
    sequenceId: z.number(),
    version: z.number(),
    status: statusThatAllowsReview,
    errors: z.array(processingAnnotation).nullable(),
    warnings: z.array(processingAnnotation).nullable(),
    originalData: z.object({
        metadata: z.record(metadataField),
        unalignedNucleotideSequences: z.record(z.string()),
    }),
    processedData: z.object({
        metadata: z.record(metadataField),
        unalignedNucleotideSequences: z.record(z.string()),
    }),
});
export type SequenceReview = z.infer<typeof sequenceReview>;

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
    years: string[];
    citations: number[];
};
