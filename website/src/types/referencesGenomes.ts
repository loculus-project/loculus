import z from 'zod';

const namedSequence = z.object({
    name: z.string(),
    sequence: z.string(),
});

export const referenceGenome = z.object({
    nucleotideSequences: z.array(namedSequence).refine((data) => data.length > 0, {
        message: 'Array must have at least one entry',
    }),
    genes: z.array(namedSequence),
});
export type referenceGenome = z.infer<typeof referenceGenome>;

export type referenceGenomeSequenceNames = {
    nucleotideSequences: string[];
    genes: string[];
};
