import { z } from 'zod';

export const submissionStatusAll = z.enum([
    'READY_TO_SUBMIT',
    'SUBMITTING_PROJECT',
    'SUBMITTED_PROJECT',
    'SUBMITTING_SAMPLE',
    'SUBMITTED_SAMPLE',
    'SUBMITTING_ASSEMBLY',
    'SUBMITTED_ALL',
    'SENT_TO_LOCULUS',
    'HAS_ERRORS_PROJECT',
    'HAS_ERRORS_ASSEMBLY',
    'HAS_ERRORS_SAMPLE',
    'HAS_ERRORS_EXT_METADATA_UPLOAD',
]);

export type SubmissionStatusAll = z.infer<typeof submissionStatusAll>;

export const tableStatus = z.enum(['READY', 'SUBMITTING', 'SUBMITTED', 'HAS_ERRORS', 'WAITING']);

export type TableStatus = z.infer<typeof tableStatus>;

export const submissionSummary = z.object({
    accession: z.string(),
    version: z.number(),
    organism: z.string(),
    group_id: z.number(),
    status_all: submissionStatusAll,
    started_at: z.string(),
    finished_at: z.string().nullable(),
    has_errors: z.boolean(),
    error_count: z.number(),
});

export type SubmissionSummary = z.infer<typeof submissionSummary>;

export const submissionDetail = z.object({
    accession: z.string(),
    version: z.number(),
    organism: z.string(),
    group_id: z.number(),
    status_all: submissionStatusAll,
    metadata: z.record(z.unknown()),
    unaligned_nucleotide_sequences: z.record(z.string().nullable()),
    errors: z.array(z.string()).nullable(),
    warnings: z.array(z.string()).nullable(),
    started_at: z.string(),
    finished_at: z.string().nullable(),
    external_metadata: z.record(z.unknown()).nullable(),
    project_status: tableStatus.nullable(),
    sample_status: tableStatus.nullable(),
    assembly_status: tableStatus.nullable(),
    project_result: z.record(z.unknown()).nullable(),
    sample_result: z.record(z.unknown()).nullable(),
    assembly_result: z.record(z.unknown()).nullable(),
});

export type SubmissionDetail = z.infer<typeof submissionDetail>;

export const paginatedSubmissions = z.object({
    items: z.array(submissionSummary),
    total: z.number(),
    page: z.number(),
    size: z.number(),
    pages: z.number(),
});

export type PaginatedSubmissions = z.infer<typeof paginatedSubmissions>;

export const submissionPreviewItem = z.object({
    accession: z.string(),
    version: z.number(),
    organism: z.string(),
    group_id: z.number(),
    metadata: z.record(z.unknown()),
    unaligned_nucleotide_sequences: z.record(z.string().nullable()),
    validation_errors: z.array(z.string()),
    validation_warnings: z.array(z.string()),
});

export type SubmissionPreviewItem = z.infer<typeof submissionPreviewItem>;

export const previewResponse = z.object({
    previews: z.array(submissionPreviewItem),
});

export type PreviewResponse = z.infer<typeof previewResponse>;

export const submitItem = z.object({
    accession: z.string(),
    version: z.number(),
    organism: z.string(),
    group_id: z.number(),
    metadata: z.record(z.unknown()),
    unaligned_nucleotide_sequences: z.record(z.string().nullable()),
});

export type SubmitItem = z.infer<typeof submitItem>;

export const submitError = z.object({
    accession: z.string(),
    version: z.number(),
    message: z.string(),
});

export type SubmitError = z.infer<typeof submitError>;

export const submitResponse = z.object({
    submitted: z.array(z.string()),
    errors: z.array(submitError),
});

export type SubmitResponse = z.infer<typeof submitResponse>;

export const errorItem = z.object({
    accession: z.string(),
    version: z.number(),
    organism: z.string(),
    group_id: z.number(),
    table: z.string(),
    error_messages: z.array(z.string()),
    status: z.string(),
    started_at: z.string(),
    can_retry: z.boolean(),
});

export type ErrorItem = z.infer<typeof errorItem>;

export const paginatedErrors = z.object({
    items: z.array(errorItem),
    total: z.number(),
    page: z.number(),
    size: z.number(),
    pages: z.number(),
});

export type PaginatedErrors = z.infer<typeof paginatedErrors>;

export const actionResponse = z.object({
    success: z.boolean(),
    message: z.string(),
});

export type ActionResponse = z.infer<typeof actionResponse>;

export const healthResponse = z.object({
    status: z.string(),
    message: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponse>;

export const readyToSubmitItem = z.object({
    accession: z.string(),
    version: z.number(),
    organism: z.string(),
    group_id: z.number(),
    group_name: z.string(),
    submitted_date: z.string(),
    metadata: z.record(z.unknown()),
    unaligned_nucleotide_sequences: z.record(z.string().nullable()),
});

export type ReadyToSubmitItem = z.infer<typeof readyToSubmitItem>;

export const paginatedReadyToSubmit = z.object({
    items: z.array(readyToSubmitItem),
    total: z.number(),
    page: z.number(),
    size: z.number(),
    pages: z.number(),
});

export type PaginatedReadyToSubmit = z.infer<typeof paginatedReadyToSubmit>;
