import z from 'zod';

const referenceAccession = z.object({
    name: z.string(),
    insdc_accession_full: z.optional(z.string()),
});
export type ReferenceAccession = z.infer<typeof referenceAccession>;

const namedSequence = z.object({
    name: z.string(),
    sequence: z.string(),
    insdc_accession_full: z.optional(z.string()),
});
export type NamedSequence = z.infer<typeof namedSequence>;

export const referenceGenomes = z.object({
    nucleotideSequences: z.array(namedSequence).refine((data) => data.length > 0, {
        message: 'Array must have at least one entry',
    }),
    genes: z.array(namedSequence),
});
export type ReferenceGenomes = z.infer<typeof referenceGenomes>;

export type NucleotideSegmentNames = string[];

export type ReferenceGenomesSequenceNames = {
    nucleotideSequences: NucleotideSegmentNames;
    genes: string[];
    insdc_accession_full: ReferenceAccession[];
};
