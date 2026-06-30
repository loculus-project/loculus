import z from 'zod';

export enum SeqSetRecordType {
    loculus = 'Loculus',
}

export const seqSetRecord = z.object({
    accession: z.string(),
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

const citationContributor = z.object({
    givenName: z.string(),
    surname: z.string(),
});

export const citationSource = z.object({
    sourceDOI: z.string(),
    title: z.string(),
    year: z.number(),
    contributors: z.array(citationContributor),
});

export const citationOrigin = z.enum(['CROSSREF', 'CURATED']);
export type CitationOrigin = z.infer<typeof citationOrigin>;

const seqSetCitation = z.object({
    source: citationSource,
});
export type SeqSetCitation = z.infer<typeof seqSetCitation>;

export const seqSetCitations = z.array(seqSetCitation);

const sequenceCitation = z.object({
    source: citationSource,
    seqSets: z.array(
        z.object({
            seqSetAccessionVersion: z.string(),
            // can be either a bare accession or an accessionVersion
            sequenceAccession: z.string(),
        }),
    ),
});
export type SequenceCitation = z.infer<typeof sequenceCitation>;

export const sequenceCitations = z.array(sequenceCitation);

const citedSeqSet = z.object({
    seqSetAccessionVersion: z.string(),
    name: z.string(),
    seqSetDOI: z.string().nullish(),
});
export type CitedSeqSet = z.infer<typeof citedSeqSet>;

export const adminSeqSetCitation = z.object({
    source: citationSource,
    seqSets: z.array(citedSeqSet),
    origin: citationOrigin,
});
export type AdminSeqSetCitation = z.infer<typeof adminSeqSetCitation>;

export const adminSeqSetCitations = z.array(adminSeqSetCitation);

export const addSeqSetCitationRequest = z.object({
    source: citationSource,
    seqSetAccessionVersions: z.array(z.string()),
});
export type AddSeqSetCitationRequest = z.infer<typeof addSeqSetCitationRequest>;
