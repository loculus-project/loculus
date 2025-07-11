import z from 'zod';

import { mutationProportionCount, orderByType } from './lapis.ts';
import { referenceGenomes } from './referencesGenomes.ts';

// These metadata types need to be kept in sync with the backend config class `MetadataType` in Config.kt
export const metadataPossibleTypes = z.enum([
    'string',
    'date',
    'int',
    'float',
    'timestamp',
    'boolean',
    'authors',
] as const);

export const segmentedMutations = z.object({
    segment: z.string(),
    mutations: z.array(mutationProportionCount),
});

export const customDisplay = z.object({
    type: z.string(),
    url: z.string().optional(),
    html: z.string().optional(),
    value: z.array(segmentedMutations).optional(),
    displayGroup: z.string().optional(),
});

/**
 * RangeOverlapSearch to configure on two fields that together allow to query
 * For an overlap of a search range and a target range
 */
export const rangeOverlapSearch = z.object({
    /**
     * specify rangeName in both (upper and lower) fields to link them later.
     */
    rangeName: z.string(),
    rangeDisplayName: z.string(), // just needed in the 'lower' field technically
    bound: z.enum(['lower', 'upper']),
});

export const metadata = z.object({
    name: z.string(),
    displayName: z.string().optional(),
    type: metadataPossibleTypes,
    autocomplete: z.boolean().optional(),
    notSearchable: z.boolean().optional(),
    hideInSearchResultsTable: z.boolean().optional(),
    customDisplay: customDisplay.optional(),
    initiallyVisible: z.boolean().optional(),
    hideOnSequenceDetailsPage: z.boolean().optional(),
    header: z.string().optional(),
    rangeSearch: z.boolean().optional(),
    rangeOverlapSearch: rangeOverlapSearch.optional(),
    substringSearch: z.boolean().optional(),
    lineageSearch: z.boolean().optional(),
    columnWidth: z.number().optional(),
    order: z.number().optional(),
    includeInDownloadsByDefault: z.boolean().optional(),
});

export const inputFieldOption = z.object({
    name: z.string(),
});

export const inputField = z.object({
    name: z.string(),
    displayName: z.string().optional(),
    noEdit: z.boolean().optional(),
    required: z.boolean().optional(),
    definition: z.string().optional(), // Definition, Example and Guidance for submitters
    example: z.union([z.string(), z.number()]).optional(),
    guidance: z.string().optional(),
    desired: z.boolean().optional(),
    options: z.array(inputFieldOption).optional(),
});

export type InputFieldOption = z.infer<typeof inputFieldOption>;
export type InputField = z.infer<typeof inputField>;
export type CustomDisplay = z.infer<typeof customDisplay>;
export type Metadata = z.infer<typeof metadata>;
export type MetadataType = z.infer<typeof metadataPossibleTypes>;
export type SegmentedMutations = z.infer<typeof segmentedMutations>;

export type MetadataFilter = Metadata & {
    fieldGroup?: string;
    grouped?: false;
    fieldGroupDisplayName?: string;
    isVisible?: boolean;
};

export type GroupedMetadataFilter = {
    name: string;
    groupedFields: MetadataFilter[];
    type: Metadata['type'];
    grouped: true;
    displayName?: string;
    isVisible?: boolean;
    notSearchable?: boolean;
    initiallyVisible?: boolean;
    header?: string;
};

export const linkOut = z.object({
    name: z.string(),
    url: z.string(),
    maxNumberOfRecommendedEntries: z.number().int().positive().optional(),
});

export type LinkOut = z.infer<typeof linkOut>;

export const fileCategory = z.object({
    name: z.string(),
});

export type FileCategory = z.infer<typeof fileCategory>;

export const submissionFiles = z.object({
    enabled: z.boolean(),
    categories: z.array(fileCategory).optional(),
});

export const submissionDataTypesSchema = z.object({
    consensusSequences: z.boolean(),
    files: submissionFiles.optional(),
});

export type SubmissionDataTypes = z.infer<typeof submissionDataTypesSchema>;

export const schema = z.object({
    organismName: z.string(),
    image: z.string().optional(),
    files: z.array(fileCategory).optional(),
    metadata: z.array(metadata),
    metadataTemplate: z.array(z.string()).optional(),
    inputFields: z.array(inputField),
    tableColumns: z.array(z.string()),
    primaryKey: z.string(),
    defaultOrderBy: z.string(),
    defaultOrder: orderByType,
    submissionDataTypes: submissionDataTypesSchema,
    loadSequencesAutomatically: z.boolean().optional(),
    richFastaHeaderFields: z.array(z.string()).optional(),
    linkOuts: z.array(linkOut).optional(),
});
export type Schema = z.infer<typeof schema>;

export const instanceConfig = z.object({
    schema,
    referenceGenomes,
});
export type InstanceConfig = z.infer<typeof instanceConfig>;

const logoConfig = z.object({
    url: z.string(),
    width: z.number(),
    height: z.number(),
});

const githubSequenceFlaggingConfig = z.object({
    organization: z.string(),
    repository: z.string(),
    issueTemplate: z.string().optional(),
});

const sequenceFlaggingConfig = z.object({
    github: githubSequenceFlaggingConfig,
});
export type SequenceFlaggingConfig = z.infer<typeof sequenceFlaggingConfig>;

const fieldToDisplay = z.object({
    field: z.string(),
    displayName: z.string(),
});

export const websiteConfig = z.object({
    accessionPrefix: z.string(),
    organisms: z.record(instanceConfig),
    name: z.string(),
    logo: logoConfig,
    bannerMessage: z.string().optional(),
    bannerMessageURL: z.string().optional(),
    welcomeMessageHTML: z.string().optional().nullable(),
    additionalHeadHTML: z.string().optional(),
    gitHubEditLink: z.string().optional(),
    gitHubMainUrl: z.string().optional(),
    enableSeqSets: z.boolean(),
    seqSetsFieldsToDisplay: z.array(fieldToDisplay).optional(),
    enableLoginNavigationItem: z.boolean(),
    enableSubmissionNavigationItem: z.boolean(),
    enableSubmissionPages: z.boolean(),
    enableDataUseTerms: z.boolean(),
    sequenceFlagging: sequenceFlaggingConfig.optional(),
});
export type WebsiteConfig = z.infer<typeof websiteConfig>;

export type FieldValues = {
    mutation?: string;
    accession?: string;
} & Record<string, string | number | null>;
export type SetSomeFieldValues = (...fieldValuesToSet: [string, string | number | null][]) => void;
export type SetAFieldValue = (fieldName: string, value: string | number | null) => void;
