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
    datasetDOI: z.string().optional(),
    datasetVersion: z.number(),
    name: z.string(),
    description: z.string().optional(),
    createdAt: z.string(),
    createdBy: z.string(),
    records: z.array(datasetRecord).optional(),
});
export const datasets = z.array(dataset);
export type Dataset = z.infer<typeof dataset>;

export const datasetCitation = z.object({
    citationId: z.string(),
    datasetId: z.string(),
    createdAt: z.string(),
    createdBy: z.string(),
});
export type DatasetCitation = z.infer<typeof datasetCitation>;
export const datasetCitations = z.array(datasetCitation);

export const citedByResult = z.object({
    years: z.array(z.number()),
    citations: z.array(z.number()),
});
export type CitedByResult = z.infer<typeof citedByResult>;
