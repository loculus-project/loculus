import z from 'zod';

const namedSequence = z.object({
    name: z.string(),
    sequence: z.string(),
    insdc_accession_full: z.optional(z.string()),
});

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
    insdc_accession_full: (string | undefined)[];
};
