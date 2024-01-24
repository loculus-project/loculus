import z from 'zod';

export enum DatasetRecordType {
    loculus = 'Loculus',
    genbank = 'GenBank',
    sra = 'SRA',
    gisaid = 'GISAID',
}

export const datasetRecord = z.object({
    accession: z.string().optional(),
    type: z.nativeEnum(DatasetRecordType).optional(),
});
export type DatasetRecord = z.infer<typeof datasetRecord>;
export const datasetRecords = z.array(datasetRecord);

export const dataset = z.object({
    datasetId: z.string(),
    datasetDOI: z.string().nullish(),
    datasetVersion: z.number(),
    name: z.string(),
    description: z.string().optional(),
    createdAt: z.string(),
    createdBy: z.string(),
    records: z.array(datasetRecord).optional(),
});
export const datasets = z.array(dataset);
export type Dataset = z.infer<typeof dataset>;

export const citedByResult = z.object({
    years: z.array(z.number()),
    citations: z.array(z.number()),
});
export type CitedByResult = z.infer<typeof citedByResult>;

export const authorProfile = z.object({
    authorId: z.string(),
    name: z.string(),
    link: z.string(),
    affiliations: z.string(),
    email: z.string(),
    citedBy: z.number(),
    thumbnail: z.string(),
    interests: z.array(
        z.object({
            title: z.string(),
            link: z.string(),
        }),
    ),
});
export const authorProfiles = z.array(authorProfile);
export type AuthorProfile = z.infer<typeof authorProfile>;
