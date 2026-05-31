// Canonical config shapes returned by `/api/config/...`. Mirror the Kotlin
// types in `backend/.../config/Config.kt` + `InstanceConfig.kt`; keep these in
// lock-step (widen on the backend side first).
import { z } from 'zod';

export const metadataPossibleTypes = z.enum([
    'string',
    'date',
    'int',
    'float',
    'number',
    'timestamp',
    'boolean',
    'authors',
] as const);
export type MetadataType = z.infer<typeof metadataPossibleTypes>;

export const orderDirection = z.enum(['ascending', 'descending']);
export type OrderDirection = z.infer<typeof orderDirection>;

export const canonicalLogo = z.object({
    url: z.string(),
    alt: z.string().optional().nullable(),
    width: z.number().optional().nullable(),
    height: z.number().optional().nullable(),
});

export const canonicalSupportContact = z.object({
    email: z.string().optional().nullable(),
    url: z.string().optional().nullable(),
});

export const canonicalFileSharing = z.object({
    outputFileUrlType: z.enum(['website', 'backend', 's3']).default('website'),
});

export const canonicalDataUseTermsUrls = z
    .object({
        open: z.string(),
        restricted: z.string(),
    })
    .nullable();

export const canonicalDataUseTerms = z.object({
    enabled: z.boolean(),
    urls: canonicalDataUseTermsUrls,
});

export const canonicalFieldToDisplay = z.object({
    field: z.string(),
    displayName: z.string(),
});

export const canonicalSeqSetGraph = z.object({
    name: z.string(),
    displayName: z.string(),
    type: z.enum(['date', 'category']),
    fields: z.array(z.string()),
});

export const canonicalGithubSequenceFlagging = z.object({
    organization: z.string(),
    repository: z.string(),
    issueTemplate: z.string().optional().nullable(),
});

export const canonicalSequenceFlagging = z.object({
    github: canonicalGithubSequenceFlagging,
});

export const canonicalInstanceConfig = z.object({
    name: z.string(),
    accessionPrefix: z.string(),
    dataUseTerms: canonicalDataUseTerms,
    fileSharing: canonicalFileSharing,
    description: z.string().optional().nullable(),
    logo: canonicalLogo.optional().nullable(),
    supportContact: canonicalSupportContact.optional().nullable(),
    bannerMessage: z.string().optional().nullable(),
    bannerMessageURL: z.string().optional().nullable(),
    submissionBannerMessage: z.string().optional().nullable(),
    submissionBannerMessageURL: z.string().optional().nullable(),
    welcomeMessageHTML: z.string().optional().nullable(),
    additionalHeadHTML: z.string().optional().nullable(),
    gitHubEditLink: z.string().optional().nullable(),
    gitHubMainUrl: z.string().optional().nullable(),
    gitHubIssuesUrl: z.string().optional().nullable(),
    issuesEmail: z.string().optional().nullable(),
    enableSeqSets: z.boolean().default(false),
    seqSetsFieldsToDisplay: z.array(canonicalFieldToDisplay).optional().nullable(),
    seqSetsGraphs: z.array(canonicalSeqSetGraph).optional().nullable(),
    enableLoginNavigationItem: z.boolean().default(true),
    enableSubmissionNavigationItem: z.boolean().default(true),
    enableSubmissionPages: z.boolean().default(true),
    dataUseTermsAgreementHTML: z.string().optional().nullable(),
    sequenceFlagging: canonicalSequenceFlagging.optional().nullable(),
    dateFieldForGroupGraph: z.string().optional().nullable(),
    // Map: lineage system key → pipeline version (string) → definition-file URL.
    lineageSystemDefinitions: z.record(z.string(), z.record(z.string(), z.string())).optional().nullable(),
});
export type CanonicalInstanceConfig = z.infer<typeof canonicalInstanceConfig>;

export const canonicalInstanceResponse = z.object({
    version: z.number(),
    publishedAt: z.string(),
    config: canonicalInstanceConfig,
    readOnlyMode: z.boolean().default(false),
});
export type CanonicalInstanceResponse = z.infer<typeof canonicalInstanceResponse>;

export const canonicalRangeBound = z.enum(['lower', 'upper']);
export const canonicalRangeOverlapSearch = z.object({
    rangeName: z.string(),
    rangeDisplayName: z.string(),
    bound: canonicalRangeBound,
});

export const canonicalCustomDisplay = z.record(z.string(), z.unknown());

export const canonicalMetadata = z.object({
    name: z.string(),
    type: metadataPossibleTypes,
    required: z.boolean().optional(),
    displayName: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    definition: z.string().optional().nullable(),
    header: z.string().optional().nullable(),
    hidden: z.boolean().optional().nullable(),
    customDisplay: canonicalCustomDisplay.optional().nullable(),
    autocomplete: z.boolean().optional().nullable(),
    notSearchable: z.boolean().optional().nullable(),
    noInput: z.boolean().optional().nullable(),
    hideInSearchResultsTable: z.boolean().optional().nullable(),
    initiallyVisible: z.boolean().optional().nullable(),
    hideOnSequenceDetailsPage: z.boolean().optional().nullable(),
    rangeSearch: z.boolean().optional().nullable(),
    rangeOverlapSearch: canonicalRangeOverlapSearch.optional().nullable(),
    substringSearch: z.boolean().optional().nullable(),
    lineageSearch: z.boolean().optional().nullable(),
    columnWidth: z.number().optional().nullable(),
    order: z.number().optional().nullable(),
    orderOnDetailsPage: z.number().optional().nullable(),
    orderInSearchDisplay: z.number().optional().nullable(),
    includeInDownloadsByDefault: z.boolean().optional().nullable(),
    onlyForReference: z.string().optional().nullable(),
    isSequenceFilter: z.boolean().optional().nullable(),
    relatesToSegment: z.string().optional().nullable(),
    percentage: z.boolean().optional().nullable(),
    // Adapter-side fields used to render SILO config.
    perSegment: z.boolean().optional().nullable(),
    lineageSystem: z.string().optional().nullable(),
    generateIndex: z.boolean().optional().nullable(),
    oneHeader: z.boolean().optional().nullable(),
    options: z.array(z.object({ name: z.string() })).optional().nullable(),
    ingest: z.string().optional().nullable(),
    ontology_id: z.string().optional().nullable(),
});

export const canonicalExternalMetadata = z.object({
    externalMetadataUpdater: z.string(),
    name: z.string(),
    type: metadataPossibleTypes,
    required: z.boolean().optional(),
});

export const canonicalInputFieldOption = z.object({ name: z.string() });
export const canonicalInputField = z.object({
    name: z.string(),
    displayName: z.string().optional().nullable(),
    noEdit: z.boolean().optional().nullable(),
    required: z.boolean().optional().nullable(),
    definition: z.string().optional().nullable(),
    example: z.union([z.string(), z.number()]).optional().nullable(),
    guidance: z.string().optional().nullable(),
    desired: z.boolean().optional().nullable(),
    options: z.array(canonicalInputFieldOption).optional().nullable(),
});

export const canonicalMultiFieldSearch = z.object({
    name: z.string(),
    displayName: z.string(),
    fields: z.array(z.string()),
    orderInSearchDisplay: z.number().optional().nullable(),
});

export const canonicalLinkOut = z.object({
    name: z.string(),
    url: z.string(),
    maxNumberOfRecommendedEntries: z.number().int().positive().optional().nullable(),
    onlyForReferences: z.record(z.string(), z.string()).optional().nullable(),
    category: z.string().optional().nullable(),
});

export const canonicalFileCategory = z.object({
    name: z.string(),
    displayName: z.string().optional().nullable(),
});

export const canonicalFilesSubmissionDataType = z.object({
    enabled: z.boolean(),
    categories: z.array(canonicalFileCategory),
});

export const canonicalSubmissionDataTypes = z.object({
    consensusSequences: z.boolean().default(true),
    maxSequencesPerEntry: z.number().int().optional().nullable(),
    files: canonicalFilesSubmissionDataType.optional().nullable(),
});

export const canonicalEarliestReleaseDate = z.object({
    enabled: z.boolean().default(false),
    externalFields: z.array(z.string()),
});

export const canonicalSchema = z.object({
    // Legacy. The original required name field from the pre-DB Helm config
    // schema. Still read by `website/src/services/configTransform.ts` (maps
    // it onto the website-internal Schema.organismName) and by the
    // SILO database config (`instanceName`). New code should prefer the
    // top-level `OrganismConfig.displayName` and treat this as a backward-
    // compat fallback; this field will be removed once all consumers
    // migrate.
    organismName: z.string(),
    image: z.string().optional().nullable(),
    metadata: z.array(canonicalMetadata),
    externalMetadata: z.array(canonicalExternalMetadata).default([]),
    metadataTemplate: z.array(z.string()).optional().nullable(),
    inputFields: z.array(canonicalInputField).default([]),
    tableColumns: z.array(z.string()).default([]),
    primaryKey: z.string().optional().nullable(),
    defaultOrderBy: z.string().optional().nullable(),
    defaultOrder: orderDirection.optional().nullable(),
    earliestReleaseDate: canonicalEarliestReleaseDate.optional(),
    submissionDataTypes: canonicalSubmissionDataTypes.optional(),
    files: z.array(canonicalFileCategory).default([]),
    loadSequencesAutomatically: z.boolean().optional().nullable(),
    richFastaHeaderFields: z.array(z.string()).optional().nullable(),
    linkOuts: z.array(canonicalLinkOut).default([]),
    referenceIdentifierField: z.string().optional().nullable(),
    multiFieldSearches: z.array(canonicalMultiFieldSearch).optional().nullable(),
});
export type CanonicalSchema = z.infer<typeof canonicalSchema>;

export const canonicalReferenceGene = z.object({ name: z.string(), sequence: z.string() });
export const canonicalReference = z.object({
    name: z.string(),
    displayName: z.string().optional().nullable(),
    sequence: z.string(),
    insdcAccessionFull: z.string().optional().nullable(),
    genes: z.array(canonicalReferenceGene).optional().nullable(),
});
export const canonicalReferenceGenomeSegment = z.object({
    name: z.string(),
    displayName: z.string().optional().nullable(),
    references: z.array(canonicalReference),
});

export const canonicalReferenceSequence = z.object({ name: z.string(), sequence: z.string() });
export const canonicalReferenceGenome = z.object({
    nucleotideSequences: z.array(canonicalReferenceSequence),
    genes: z.array(canonicalReferenceSequence),
});
export type CanonicalReferenceGenome = z.infer<typeof canonicalReferenceGenome>;

export const canonicalOrganismImage = z.object({ url: z.string() });

export const canonicalOrganismConfig = z.object({
    schema: canonicalSchema,
    referenceGenome: canonicalReferenceGenome,
    /**
     * Human-facing display name for this organism. The canonical name field
     * for new code; preferred over the legacy `schema.organismName`.
     */
    displayName: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    image: canonicalOrganismImage.optional().nullable(),
    referenceGenomes: z.array(canonicalReferenceGenomeSegment).optional().nullable(),
});
export type CanonicalOrganismConfig = z.infer<typeof canonicalOrganismConfig>;

export const canonicalOrganismResponse = z.object({
    key: z.string(),
    version: z.number(),
    publishedAt: z.string(),
    config: canonicalOrganismConfig,
});
export type CanonicalOrganismResponse = z.infer<typeof canonicalOrganismResponse>;

export const canonicalOrganismsListResponse = z.object({
    organisms: z.array(
        z.object({
            key: z.string(),
            displayName: z.string(),
            currentVersion: z.number(),
        }),
    ),
});
export type CanonicalOrganismsListResponse = z.infer<typeof canonicalOrganismsListResponse>;
