import z from 'zod';

export type ReferenceAccession = {
    name: string;
    insdcAccessionFull?: string;
};

const namedSequence = z.object({
    name: z.string(),
    sequence: z.string(),
    insdcAccessionFull: z.optional(z.string()),
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
    insdcAccessionFull: ReferenceAccession[];
};
