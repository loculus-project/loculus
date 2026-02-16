import z from 'zod';

export enum SeqSetRecordType {
    loculus = 'Loculus',
}

export const seqSetRecord = z.object({
    accession: z.string(),
    // eslint-disable-next-line @typescript-eslint/no-deprecated, import/no-deprecated -- z.enum() doesn't accept native enums in zod v3 compat layer
    type: z.nativeEnum(SeqSetRecordType),
    isFocal: z.boolean(),
});
export type SeqSetRecord = z.infer<typeof seqSetRecord>;
export const seqSetRecords = z.array(seqSetRecord);

export const seqSet = z.object({
    seqSetId: z.string(),
    seqSetDOI: z.string().nullish(),
    seqSetVersion: z.number(),
    name: z.string(),
    description: z.string().optional(),
    createdAt: z.string(),
    createdBy: z.string(),
});
export const seqSets = z.array(seqSet);
export type SeqSet = z.infer<typeof seqSet>;

export const citedByResult = z.object({
    years: z.array(z.number()),
    citations: z.array(z.number()),
});
export type CitedByResult = z.infer<typeof citedByResult>;

export const authorProfile = z.object({
    username: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    emailDomain: z.string(),
    university: z.string().nullish(),
});
export type AuthorProfile = z.infer<typeof authorProfile>;
