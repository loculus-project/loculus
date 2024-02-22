import z from 'zod';

import { orderByType } from './lapis.ts';
import { referenceGenomes } from './referencesGenomes.ts';

export const metadata = z.object({
    name: z.string(),
    type: z.enum(['string', 'date', 'int', 'float', 'pango_lineage', 'timestamp']),
    autocomplete: z.boolean().optional(),
    notSearchable: z.boolean().optional(),
});
export type Metadata = z.infer<typeof metadata>;

export type MetadataFilter = Metadata & {
    filterValue: string;
    label?: string;
};

export type FilterValue = Pick<MetadataFilter, 'name' | 'filterValue'>;

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
    tableColumns: z.array(z.string()),
    primaryKey: z.string(),
    defaultOrderBy: z.string(),
    defaultOrder: orderByType,
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
    instances: z.record(instanceConfig),
    name: z.string(),
    logo: logoConfig,
});
export type WebsiteConfig = z.infer<typeof websiteConfig>;
