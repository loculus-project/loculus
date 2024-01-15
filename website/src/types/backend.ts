import z from 'zod';

const sequenceEntryStatusNames = z.union([
    z.literal('RECEIVED'),
    z.literal('IN_PROCESSING'),
    z.literal('HAS_ERRORS'),
    z.literal('AWAITING_APPROVAL'),
    z.literal('APPROVED_FOR_RELEASE'),
    z.literal('AWAITING_APPROVAL_FOR_REVOCATION'),
]);
const statusThatAllowsEditing = z.union([z.literal('HAS_ERRORS'), z.literal('AWAITING_APPROVAL')]);

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

export const metadataField = z.union([z.string(), z.number(), z.date()]);
export type MetadataField = z.infer<typeof metadataField>;

const metadataRecord = z.record(metadataField);
export type MetadataRecord = z.infer<typeof metadataRecord>;

export const accession = z.string();
export type Accession = z.infer<typeof accession>;

export const accessions = z.object({
    accessions: z.array(accession),
});

export const accessionVersion = z.object({
    accession,
    version: z.number(),
});
export type AccessionVersion = z.infer<typeof accessionVersion>;

export const accessionVersionsObject = z.object({
    accessionVersions: z.array(accessionVersion),
});

export const sequenceEntryStatus = accessionVersion.merge(
    z.object({
        status: sequenceEntryStatusNames,
        isRevocation: z.boolean(),
    }),
);
export type SequenceEntryStatus = z.infer<typeof sequenceEntryStatus>;

export const submissionIdMapping = accessionVersion.merge(
    z.object({
        submissionId: z.string(),
    }),
);
export type SubmissionIdMapping = z.infer<typeof submissionIdMapping>;

export const unprocessedData = accessionVersion.merge(
    z.object({
        data: z.object({
            metadata: metadataRecord,
            unalignedNucleotideSequences: z.record(z.string()),
        }),
    }),
);
export type UnprocessedData = z.infer<typeof unprocessedData>;

export const sequenceEntryToEdit = accessionVersion.merge(
    z.object({
        status: statusThatAllowsEditing,
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
export type SequenceEntryToEdit = z.infer<typeof sequenceEntryToEdit>;

export const uploadFiles = z.object({
    metadataFile: z.instanceof(File),
    sequenceFile: z.instanceof(File),
});

export const submitFiles = uploadFiles.merge(
    z.object({
        groupName: z.string(),
    }),
);

export const problemDetail = z.object({
    type: z.string(),
    title: z.string(),
    status: z.number(),
    detail: z.string(),
    instance: z.string().optional(),
});
export type ProblemDetail = z.infer<typeof problemDetail>;

export const dataset = z.object({
    datasetId: z.string(),
    datasetDOI: z.string().optional(),
    datasetVersion: z.number(),
    name: z.string(),
    description: z.string().optional(),
    createdAt: z.string(),
    createdBy: z.string(),
    records: z
        .array(
            z.object({
                accession: z.string().optional(),
                type: z.string().optional(),
            }),
        )
        .optional(),
});
export const datasets = z.array(dataset);
export type Dataset = z.infer<typeof dataset>;

export const datasetRecord = z.object({
    accession: z.string().optional(),
    type: z.string().optional(),
});
export const datasetRecords = z.array(datasetRecord);
export type DatasetRecord = z.infer<typeof datasetRecord>;

export const accessionCitation = z.object({
    datasetId: z.string(),
    date: z.string(),
});
export const accessionCitations = z.array(accessionCitation);
export type AccessionCitation = z.infer<typeof accessionCitation>;

export const datasetCitationResult = z.object({
    years: z.array(z.string()),
    citations: z.array(z.number()),
});
export const datasetCitationResults = z.array(datasetCitationResult);
export type DatasetCitationResult = z.infer<typeof datasetCitationResult>;
export const group = z.object({
    groupName: z.string(),
});

export type Group = z.infer<typeof group>;

export const groupDetails = z.object({
    groupName: z.string(),
    users: z.array(
        z.object({
            name: z.string(),
        }),
    ),
});
