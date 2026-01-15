import z from 'zod';

export type ReferenceAccession = {
    name: string;
    insdcAccessionFull?: string;
};

export type SegmentName = string;
export type ReferenceName = string;
export type GeneName = string;

export type GeneSequenceData = {
    sequence: string;
};

export type ReferenceSequenceData = {
    sequence: string;
    insdcAccessionFull?: string;
    genes?: Record<GeneName, GeneSequenceData>;
};

export const ReferenceGenomesMap = z.record(
    z.string(), // segment name
    z.record(
        z.string(), // reference name
        z.object({
            insdcAccessionFull: z.string().optional(),
            genes: z.array(z.string()).optional(),
        }),
    ),
);
export type ReferenceGenomesMap = z.infer<typeof ReferenceGenomesMap>;

export const referenceGenomesSchema = z
    .array(
        z.object({
            name: z.string(),
            references: z.array(
                z.object({
                    reference_name: z.string(),
                    sequence: z.string(),
                    insdcAccessionFull: z.string().optional(),
                    genes: z.array(z.object({ name: z.string(), sequence: z.string() })).optional(),
                }),
            ),
        }),
    )
    .optional();
export type ReferenceGenomes = z.infer<typeof referenceGenomesSchema>;

export function toReferenceGenomesMap(values: ReferenceGenomes): ReferenceGenomesMap {
    const out: ReferenceGenomesMap = {};

    for (const genome of values ?? []) {
        const segmentName = genome.name;

        out[segmentName] ??= {};

        for (const ref of genome.references) {
            out[segmentName][ref.reference_name] = {
                ...(ref.insdcAccessionFull ? { insdcAccessionFull: ref.insdcAccessionFull } : {}),
                ...(ref.genes
                    ? {
                          genes: ref.genes.map((gene) => gene.name),
                      }
                    : {}),
            };
        }
    }

    return ReferenceGenomesMap.parse(out);
}
