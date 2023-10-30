import z from 'zod';

export const metadata = z.object({
    name: z.string(),
    type: z.enum(['string', 'date', 'integer', 'pango_lineage']),
    autocomplete: z.boolean().optional(),
    notSearchable: z.boolean().optional(),
});
export type Metadata = z.infer<typeof metadata>;

export type Filter = Metadata & {
    filterValue: string;
    label?: string;
};

export const config = z.object({
    schema: z.object({
        instanceName: z.string(),
        metadata: z.array(metadata),
        tableColumns: z.array(z.string()),
        primaryKey: z.string(),
    }),
});
export type Config = z.infer<typeof config>;
