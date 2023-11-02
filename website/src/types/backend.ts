import z from 'zod';

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

export const sequenceId = z.string();
export type SequenceId = z.infer<typeof sequenceId>;

export const sequenceIds = z.object({
    sequenceIds: z.array(sequenceId),
});

export const sequenceVersion = z.object({
    sequenceId,
    version: z.number(),
});
export type SequenceVersion = z.infer<typeof sequenceVersion>;

export const sequenceVersionsObject = z.object({
    sequenceVersions: z.array(sequenceVersion),
});

export const sequenceStatus = sequenceVersion.merge(
    z.object({
        status: sequenceStatusNames,
        isRevocation: z.boolean(),
    }),
);
export type SequenceStatus = z.infer<typeof sequenceStatus>;

export const headerId = sequenceVersion.merge(
    z.object({
        customId: z.string(),
    }),
);
export type HeaderId = z.infer<typeof headerId>;

export const unprocessedData = sequenceVersion.merge(
    z.object({
        data: z.object({
            metadata: metadataRecord,
            unalignedNucleotideSequences: z.record(z.string()),
        }),
    }),
);
export type UnprocessedData = z.infer<typeof unprocessedData>;

export const processedData = sequenceVersion.merge(
    z.object({
        data: z.any(),
        errors: z.array(processingAnnotation).optional(),
        warnings: z.array(processingAnnotation).optional(),
    }),
);

export type ProcessedData = z.infer<typeof processedData>;

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
            alignedAminoAcidSequences: z.record(z.string()),
            aminoAcidInsertions: z.record(z.array(z.string())),
        }),
    }),
);
export type SequenceReview = z.infer<typeof sequenceReview>;

export const submitFiles = z.object({
    username: z.string(),
    metadataFile: z.instanceof(File),
    sequenceFile: z.instanceof(File),
});

export const problemDetail = z.object({
    type: z.string(),
    title: z.string(),
    status: z.number(),
    detail: z.string(),
    instance: z.string().optional(),
});
export type ProblemDetail = z.infer<typeof problemDetail>;
