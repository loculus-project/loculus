import z from 'zod';

import { orderByType } from './lapis.ts';
import { referenceGenomes } from './referencesGenomes.ts';

// These metadata types need to be kept in sync with the backend config class `MetadataType` in Config.kt
export const metadataPossibleTypes = ['string', 'date', 'int', 'float', 'pango_lineage', 'timestamp'] as const;

export const customDisplay = z.object({
    type: z.string(),
    url: z.string().optional(),
});

export const metadata = z.object({
    name: z.string(),
    displayName: z.string().optional(),
    type: z.enum(metadataPossibleTypes),
    autocomplete: z.boolean().optional(),
    notSearchable: z.boolean().optional(),
    customDisplay: customDisplay.optional(),
    truncateColumnDisplayTo: z.number().optional(),
    initiallyVisible: z.boolean().optional(),
    header: z.string().optional(),
});

export const inputField = z.object({
    name: z.string(),
    displayName: z.string().optional(),
});

export type InputField = z.infer<typeof inputField>;
export type CustomDisplay = z.infer<typeof customDisplay>;
export type Metadata = z.infer<typeof metadata>;

export type MetadataFilter = Metadata & {
    filterValue: string;
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

export type FilterValue = Pick<MetadataFilter, 'name' | 'filterValue'>;

export type AccessionFilter = {
    accession?: string[];
};

export type MutationFilter = {
    aminoAcidMutationQueries?: string[];
    nucleotideMutationQueries?: string[];
    aminoAcidInsertionQueries?: string[];
    nucleotideInsertionQueries?: string[];
};

const schema = z.object({
    instanceName: z.string(),
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
    additionalHeadHTML: z.string().optional(),
});
export type WebsiteConfig = z.infer<typeof websiteConfig>;
