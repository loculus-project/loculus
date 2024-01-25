import z from 'zod';

const namedSequence = z.object({
    name: z.string(),
    sequence: z.string(),
});

export const referenceGenomes = z.object({
    nucleotideSequences: z.array(namedSequence),
    genes: z.array(namedSequence),
});
export type ReferenceGenomes = z.infer<typeof referenceGenomes>;
