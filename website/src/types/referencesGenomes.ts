import z from 'zod';

import type { GeneInfo } from '../utils/sequenceTypeHelpers';

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

export type ReferenceGenomeInfo = {
    lapisName: string;
    genes: GeneInfo[];
    insdcAccessionFull: string | null;
};

export type ReferenceGenomeMap = Record<ReferenceName, ReferenceGenomeInfo>;

export type SegmentReferenceGenomes = Record<SegmentName, ReferenceGenomeMap>;

export type ReferenceGenomesInfo = {
    segmentReferenceGenomes: SegmentReferenceGenomes;
    isMultiSegmented: boolean;
    useLapisMultiSegmentedEndpoint: boolean;
};

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

export type ReferenceGenomesSchema = z.infer<typeof referenceGenomesSchema>;
