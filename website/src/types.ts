import z from 'zod';

export type PangoLineage = string;

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

export const metadataField = z.union([z.string(), z.number(), z.date()]);
export type MetadataField = z.infer<typeof metadataField>;

const metadataRecord = z.record(metadataField);
export type MetadataRecord = z.infer<typeof metadataRecord>;

export const sequenceIds = z.object({
    sequenceIds: z.array(z.number()),
});

export const sequenceVersion = z.object({
    sequenceId: z.number(),
    version: z.number(),
});
export type SequenceVersion = z.infer<typeof sequenceVersion>;

export const sequenceStatus = sequenceVersion.merge(
    z.object({
        status: sequenceStatusNames,
        isRevocation: z.boolean(),
    }),
);
export type SequenceStatus = z.infer<typeof sequenceStatus>;

export type HeaderId = SequenceVersion & {
    customId: string;
};

export const unprocessedData = sequenceVersion.merge(
    z.object({
        data: z.object({
            metadata: metadataRecord,
            unalignedNucleotideSequences: z.record(z.string()),
        }),
    }),
);
export type UnprocessedData = z.infer<typeof unprocessedData>;

export type Sequence = SequenceVersion & {
    data: any;
    errors?: ProcessingAnnotation[];
    warnings?: ProcessingAnnotation[];
};

export const sequenceReview = sequenceVersion.merge(
    z.object({
        status: statusThatAllowsReview,
        errors: z.array(processingAnnotation).nullable(),
        warnings: z.array(processingAnnotation).nullable(),
        originalData: z.object({
            metadata: metadataRecord,
            unalignedNucleotideSequences: z.record(z.string()),
        }),
        processedData: z.object({
            metadata: metadataRecord,
            unalignedNucleotideSequences: z.record(z.string()),
            alignedNucleotideSequences: z.record(z.string()),
            nucleotideInsertions: z.record(z.array(z.string())),
            aminoAcidSequences: z.record(z.string()),
            aminoAcidInsertions: z.record(z.array(z.string())),
        }),
    }),
);
export type SequenceReview = z.infer<typeof sequenceReview>;
