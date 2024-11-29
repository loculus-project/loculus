import z from 'zod';

import { mutationProportionCount, orderByType } from './lapis.ts';
import { referenceGenomes } from './referencesGenomes.ts';

// These metadata types need to be kept in sync with the backend config class `MetadataType` in Config.kt
const metadataPossibleTypes = z.enum([
    'string',
    'date',
    'int',
    'float',
    'pango_lineage',
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
    value: z.array(segmentedMutations).optional(),
    displayGroup: z.string().optional(),
});

/**
 * RangeOverlapSearch to configure on two fields that together allow to query
 * For an overlap of a search range and a targer range
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
    customDisplay: customDisplay.optional(),
    truncateColumnDisplayTo: z.number().optional(),
    initiallyVisible: z.boolean().optional(),
    hideOnSequenceDetailsPage: z.boolean().optional(),
    header: z.string().optional(),
    rangeSearch: z.boolean().optional(),
    rangeOverlapSearch: rangeOverlapSearch.optional(),
    substringSearch: z.boolean().optional(),
});

export const inputField = z.object({
    name: z.string(),
    displayName: z.string().optional(),
    noEdit: z.boolean().optional(),
});

export type InputField = z.infer<typeof inputField>;
export type CustomDisplay = z.infer<typeof customDisplay>;
export type Metadata = z.infer<typeof metadata>;
export type MetadataType = z.infer<typeof metadataPossibleTypes>;
export type SegmentedMutations = z.infer<typeof segmentedMutations>;

export type MetadataFilter = Metadata & {
    label?: string;
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
    label?: string;
    displayName?: string;
    isVisible?: boolean;
    notSearchable?: boolean;
    initiallyVisible?: boolean;
};

const schema = z.object({
    organismName: z.string(),
    image: z.string().optional(),
    description: z.string().optional(),
    metadata: z.array(metadata),
    inputFields: z.array(inputField),
    tableColumns: z.array(z.string()),
    primaryKey: z.string(),
    defaultOrderBy: z.string(),
    defaultOrder: orderByType,
    loadSequencesAutomatically: z.boolean().optional(),
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

export const websiteConfig = z.object({
    organisms: z.record(instanceConfig),
    name: z.string(),
    logo: logoConfig,
    bannerMessage: z.string().optional(),
    welcomeMessageHTML: z.string().optional().nullable(),
    additionalHeadHTML: z.string().optional(),
    gitHubEditLink: z.string().optional(),
    gitHubMainUrl: z.string().optional(),
    enableSeqSets: z.boolean(),
    enableLoginNavigationItem: z.boolean(),
    enableSubmissionNavigationItem: z.boolean(),
    enableSubmissionPages: z.boolean(),
});
export type WebsiteConfig = z.infer<typeof websiteConfig>;

export type FieldValues = Record<string, string | number | null>;
export type SetSomeFieldValues = (fieldValuesToSet: Record<string, any>) => void;
export type SetAFieldValue = (fieldName: string, value: string | number | null) => void;
