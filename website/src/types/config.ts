import z from 'zod';

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
    metadata: z.array(metadata),
    tableColumns: z.array(z.string()),
    primaryKey: z.string(),
});
export type Schema = z.infer<typeof schema>;

export const instanceConfig = z.object({
    schema,
    referenceGenomes,
});
export type InstanceConfig = z.infer<typeof instanceConfig>;

export const websiteConfig = z.object({
    instances: z.record(instanceConfig),
});
export type WebsiteConfig = z.infer<typeof websiteConfig>;
