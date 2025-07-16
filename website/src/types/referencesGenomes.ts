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

export const referenceGenome = z.object({
    nucleotideSequences: z.array(namedSequence),
    genes: z.array(namedSequence),
});
export type ReferenceGenome = z.infer<typeof referenceGenome>;

export const suborganism = z.string();
export const referenceGenomes = z
    .record(suborganism, referenceGenome)
    .refine((value) => Object.entries(value).length > 0, 'The reference genomes must not be empty.');
export type ReferenceGenomes = z.infer<typeof referenceGenomes>;

export type NucleotideSegmentNames = string[];

export type ReferenceGenomesSequenceNames = {
    nucleotideSequences: NucleotideSegmentNames;
    genes: string[];
    insdcAccessionFull: ReferenceAccession[];
};
