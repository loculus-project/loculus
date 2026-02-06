import z from 'zod';

export const receivedStatus = 'RECEIVED';
export const inProcessingStatus = 'IN_PROCESSING';
export const processedStatus = 'PROCESSED';
export const approvedForReleaseStatus = 'APPROVED_FOR_RELEASE';

export const noIssuesProcessingResult = 'NO_ISSUES';
export const warningsProcessingResult = 'HAS_WARNINGS';
export const errorsProcessingResult = 'HAS_ERRORS';

export const sequenceEntryStatusNames = z.union([
    z.literal(receivedStatus),
    z.literal(inProcessingStatus),
    z.literal(processedStatus),
    z.literal(approvedForReleaseStatus),
]);
export type SequenceEntryStatusNames = z.infer<typeof sequenceEntryStatusNames>;

export const sequenceEntryProcessingResultNames = z.union([
    z.literal(noIssuesProcessingResult),
    z.literal(warningsProcessingResult),
    z.literal(errorsProcessingResult),
]);
export type SequenceEntryProcessingResultNames = z.infer<typeof sequenceEntryProcessingResultNames>;

const processingAnnotationSourceType = z.union([z.literal('Metadata'), z.literal('NucleotideSequence')]);
export type ProcessingAnnotationSourceType = z.infer<typeof processingAnnotationSourceType>;

const processingAnnotation = z.object({
    unprocessedFields: z.array(
        z.object({
            name: z.string(),
            type: processingAnnotationSourceType,
        }),
    ),
    processedFields: z.array(
        z.object({
            name: z.string(),
            type: processingAnnotationSourceType,
        }),
    ),
    message: z.string(),
});
export type ProcessingAnnotation = z.infer<typeof processingAnnotation>;

const unprocessedMetadataRecord = z.record(z.string());
export type UnprocessedMetadataRecord = z.infer<typeof unprocessedMetadataRecord>;

export const metadataField = z.union([z.string(), z.number(), z.date(), z.null(), z.boolean()]);
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

export const accessionVersionsFilter = z.object({
    accessionVersionsFilter: z.array(accessionVersion).optional(),
});

export const approveAllDataScope = z.literal('ALL');
export const approveProcessedDataWithoutWarningsScope = z.literal('WITHOUT_WARNINGS');

export const accessionVersionsFilterWithApprovalScope = accessionVersionsFilter.merge(
    z.object({
        groupIdsFilter: z.array(z.number()),
        scope: z.union([approveAllDataScope, approveProcessedDataWithoutWarningsScope]),
    }),
);

export const deleteAllDataScope = z.literal('ALL');
export const deleteProcessedAndRevocationConfirmationDataScope = z.literal('ALL_PROCESSED_AND_REVOCATIONS');
export const deleteProcessedDataWithErrorsScope = z.literal('PROCESSED_WITH_ERRORS');
export const deleteProcessedDataWithWarningsScope = z.literal('PROCESSED_WITH_WARNINGS');

export const accessionVersionsFilterWithDeletionScope = accessionVersionsFilter.merge(
    z.object({
        groupIdsFilter: z.array(z.number()),
        scope: z.union([
            deleteAllDataScope,
            deleteProcessedAndRevocationConfirmationDataScope,
            deleteProcessedDataWithErrorsScope,
            deleteProcessedDataWithWarningsScope,
        ]),
    }),
);

export const openDataUseTermsOption = 'OPEN';

export const restrictedDataUseTermsOption = 'RESTRICTED';

export const dataUseTermsOptions = [restrictedDataUseTermsOption, openDataUseTermsOption] as const;

export type DataUseTermsOption = typeof openDataUseTermsOption | typeof restrictedDataUseTermsOption;

export const restrictedDataUseTerms = z.object({
    type: z.literal(restrictedDataUseTermsOption),
    restrictedUntil: z.string(),
});

export type RestrictedDataUseTerms = z.infer<typeof restrictedDataUseTerms>;

export const dataUseTerms = z.union([
    restrictedDataUseTerms,
    z.object({
        type: z.literal(openDataUseTermsOption),
    }),
]);

export type DataUseTerms = z.infer<typeof dataUseTerms>;

export const dataUseTermsHistoryEntry = z.object({
    accession,
    changeDate: z.string(),
    dataUseTerms,
    userName: z.string(),
});

export type DataUseTermsHistoryEntry = z.infer<typeof dataUseTermsHistoryEntry>;

export const sequenceEntryStatus = accessionVersion.merge(
    z.object({
        status: sequenceEntryStatusNames,
        processingResult: sequenceEntryProcessingResultNames.nullable(),
        submissionId: z.string(),
        isRevocation: z.boolean(),
        dataUseTerms,
        groupId: z.number(),
        submitter: z.string(),
    }),
);

export type SequenceEntryStatus = z.infer<typeof sequenceEntryStatus>;

export const statusCounts = z.record(z.number()).refine(
    (entry) => {
        return Object.keys(entry).every((key) => sequenceEntryStatusNames.safeParse(key).success);
    },
    { message: 'Invalid status name in statusCounts' },
);

export const processingResultCounts = z.record(z.number()).refine(
    (entry) => {
        return Object.keys(entry).every((key) => sequenceEntryProcessingResultNames.safeParse(key).success);
    },
    { message: 'Invalid status name in processingResultCounts' },
);

export const getSequencesResponse = z.object({
    sequenceEntries: z.array(sequenceEntryStatus),
    statusCounts,
    processingResultCounts,
});
export type GetSequencesResponse = z.infer<typeof getSequencesResponse>;

export const submissionIdMapping = accessionVersion.merge(
    z.object({
        submissionId: z.string(),
    }),
);
export type SubmissionIdMapping = z.infer<typeof submissionIdMapping>;

export const editedSequenceEntryData = accessionVersion.merge(
    z.object({
        data: z.object({
            metadata: unprocessedMetadataRecord,
            unalignedNucleotideSequences: z.record(z.string()),
        }),
    }),
);
export type EditedSequenceEntryData = z.infer<typeof editedSequenceEntryData>;

export const revocationRequest = z.object({
    accessions: z.array(accession),
    versionComment: z.string().nullable(),
});

export type RevocationRequest = z.infer<typeof revocationRequest>;

export const unprocessedData = accessionVersion.merge(
    z.object({
        data: z.object({
            metadata: unprocessedMetadataRecord,
            unalignedNucleotideSequences: z.record(z.string()),
        }),
        submissionId: z.string(),
        submitter: z.string(),
        groupId: z.number(),
        submittedAt: z.number(),
    }),
);
export type UnprocessedData = z.infer<typeof unprocessedData>;

const filesByCategory = z.record(
    z.array(
        z.object({
            fileId: z.string(),
            name: z.string(),
        }),
    ),
);

export const filesBySubmissionId = z.record(filesByCategory);
export type FilesBySubmissionId = z.infer<typeof filesBySubmissionId>;

export const sequenceEntryToEdit = accessionVersion.merge(
    z.object({
        status: sequenceEntryStatusNames,
        groupId: z.number(),
        submissionId: z.string(),
        errors: z.array(processingAnnotation).nullable(),
        warnings: z.array(processingAnnotation).nullable(),
        originalData: z.object({
            metadata: unprocessedMetadataRecord,
            unalignedNucleotideSequences: z.record(z.string()),
            files: filesByCategory.nullable(),
        }),
        processedData: z.object({
            metadata: metadataRecord,
            unalignedNucleotideSequences: z.record(z.string().nullable()),
            alignedNucleotideSequences: z.record(z.string().nullable()),
            nucleotideInsertions: z.record(z.array(z.string())),
            alignedAminoAcidSequences: z.record(z.string().nullable()),
            aminoAcidInsertions: z.record(z.array(z.string())),
            sequenceNameToFastaId: z.record(z.string().nullable()),
            files: filesByCategory.nullable(),
        }),
    }),
);
export type SequenceEntryToEdit = z.infer<typeof sequenceEntryToEdit>;

export const mapErrorsAndWarnings = (
    editedData: SequenceEntryToEdit,
    key: string,
    type: ProcessingAnnotationSourceType,
): { errors: string[]; warnings: string[] } => ({
    errors: (editedData.errors ?? [])
        .filter(
            (error) => error.processedFields.find((field) => field.name === key && field.type === type) !== undefined,
        )
        .map((error) => error.message),
    warnings: (editedData.warnings ?? [])
        .filter(
            (warning) =>
                warning.processedFields.find((field) => field.name === key && field.type === type) !== undefined,
        )
        .map((warning) => warning.message),
});

export const uploadFiles = z.object({
    metadataFile: z.instanceof(File),
    sequenceFile: z.instanceof(File).optional(),
    fileMapping: filesBySubmissionId.optional(),
});
export type UploadFiles = z.infer<typeof uploadFiles>;

export const submitFiles = uploadFiles.merge(
    z.object({
        groupId: z.number(),
        dataUseTermsType: z.enum(dataUseTermsOptions),
        restrictedUntil: z.string().nullable(),
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

export const address = z.object({
    line1: z.string(),
    line2: z.string().optional(),
    city: z.string(),
    state: z.string().optional(),
    postalCode: z.string(),
    country: z.string(),
});
export type Address = z.infer<typeof address>;

export const newGroup = z.object({
    groupName: z.string(),
    institution: z.string(),
    address,
    contactEmail: z.string().nullable(),
});
export type NewGroup = z.infer<typeof newGroup>;

export const group = newGroup.extend({
    groupId: z.number(),
});
export type Group = z.infer<typeof group>;

export const groupDetails = z.object({
    group,
    /**
     * List of users in the group.
     * Null when the requesting user is not authenticated or not authorized to view members.
     */
    users: z
        .array(
            z.object({
                name: z.string(),
            }),
        )
        .nullable(),
});

export type GroupDetails = z.infer<typeof groupDetails>;

export const pageQuery = z.object({
    pageOneIndexed: z.number(),
    size: z.number(),
});

export type PageQuery = z.infer<typeof pageQuery>;

export const info = z.object({
    name: z.string(),
    status: z.string(),
    documentation: z.string(),
    isInDebugMode: z.boolean(),
});

export type Info = z.infer<typeof info>;

export const requestMultipartUploadResponse = z.array(
    z.object({
        fileId: z.string().uuid(),
        urls: z.array(z.string()),
    }),
);

export type RequestMultipartUploadResponse = z.infer<typeof requestMultipartUploadResponse>;

export const completeMultipartUploadRequest = z.array(
    z.object({
        fileId: z.string().uuid(),
        etags: z.array(z.string()),
    }),
);

export type CompleteMultipartUploadRequest = z.infer<typeof completeMultipartUploadRequest>;

export const pipelineVersionStatistics = z.record(z.record(z.number()));
export type PipelineVersionStatistics = z.infer<typeof pipelineVersionStatistics>;
