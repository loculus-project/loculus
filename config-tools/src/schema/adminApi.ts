// Admin-only response shapes for `/api/admin/config/...`. Mirrors backend DTOs
// in AdminConfigController.kt / AuditLogService.kt / ConfigService.kt.
import { z } from 'zod';

import { canonicalInstanceConfig, canonicalOrganismConfig } from './canonicalConfig.ts';

export const organismListing = z.object({
    key: z.string(),
    status: z.enum(['unreleased', 'released']),
    currentVersion: z.number().nullable(),
    deployed: z.boolean(),
});
export type OrganismListing = z.infer<typeof organismListing>;

export const adminOrganismsListResponse = z.object({
    organisms: z.array(organismListing),
});
export type AdminOrganismsListResponse = z.infer<typeof adminOrganismsListResponse>;

export const pendingOp = z.object({
    opType: z.string(),
    summary: z.string(),
    appliedAt: z.string(),
    appliedBy: z.string(),
});
export type PendingOp = z.infer<typeof pendingOp>;

export const organismDraftResponse = z.object({
    config: canonicalOrganismConfig,
    baseVersion: z.number().nullable(),
    revision: z.number(),
    operations: z.array(pendingOp),
});
export type OrganismDraftResponse = z.infer<typeof organismDraftResponse>;

export const instanceDraftResponse = z.object({
    config: canonicalInstanceConfig,
    baseVersion: z.number().nullable(),
    revision: z.number(),
});
export type InstanceDraftResponse = z.infer<typeof instanceDraftResponse>;

export const draftMutationResponse = z.object({
    revision: z.number(),
});
export type DraftMutationResponse = z.infer<typeof draftMutationResponse>;

export const publishResponse = z.object({
    version: z.number(),
    previousVersion: z.number().nullable(),
    publishedAt: z.string(),
    publishedBy: z.string(),
});
export type PublishResponse = z.infer<typeof publishResponse>;

export const versionListing = z.object({
    version: z.number(),
    publishedAt: z.string(),
    publishedBy: z.string(),
});
export type VersionListing = z.infer<typeof versionListing>;

export const versionsResponse = z.object({
    versions: z.array(versionListing),
});
export type VersionsResponse = z.infer<typeof versionsResponse>;

export const auditEntry = z.object({
    id: z.number(),
    occurredAt: z.string(),
    actor: z.string(),
    scope: z.enum(['instance', 'organism']),
    organismKey: z.string().nullable(),
    action: z.enum(['organism_create', 'document_replace', 'op_append', 'publish', 'mark_deployed', 'discard_draft']),
    details: z.record(z.string(), z.unknown()).nullable(),
    resultVersion: z.number().nullable(),
});
export type AuditEntry = z.infer<typeof auditEntry>;

export const auditResponse = z.object({
    entries: z.array(auditEntry),
});
export type AuditResponse = z.infer<typeof auditResponse>;

export const preprocessingConfigVersion = z.object({
    pipelineVersion: z.number(),
    updatedAt: z.string(),
    updatedBy: z.string(),
});
export type PreprocessingConfigVersion = z.infer<typeof preprocessingConfigVersion>;

export const preprocessingConfigListResponse = z.object({
    versions: z.array(preprocessingConfigVersion),
});
export type PreprocessingConfigListResponse = z.infer<typeof preprocessingConfigListResponse>;

export const operationRequest = z.object({
    type: z.string(),
    payload: z.record(z.string(), z.unknown()),
});
export type OperationRequest = z.infer<typeof operationRequest>;

// `errors` is populated only by `operation_validation_failed`.
export const adminApiError = z.object({
    error: z.string(),
    message: z.string().optional(),
    opType: z.string().optional(),
    errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type AdminApiError = z.infer<typeof adminApiError>;
