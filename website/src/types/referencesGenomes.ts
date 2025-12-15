import z from 'zod';

export type ReferenceAccession = {
    name: string;
    insdcAccessionFull?: string;
};

// Segment-first structure types
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

// Segment-first reference genomes structure (from values.yaml)
// Structure: referenceGenomes[segmentName][referenceName] = { sequence, insdcAccessionFull?, genes? }
export const segmentFirstReferenceGenomes = z.record(
    z.string(), // segment name
    z.record(
        z.string(), // reference name
        z.object({
            sequence: z.string(),
            insdcAccessionFull: z.string().optional(),
            genes: z.record(z.string(), z.object({ sequence: z.string() })).optional(),
        })
    )
);
export type SegmentFirstReferenceGenomes = z.infer<typeof segmentFirstReferenceGenomes>;

// Type alias for the new segment-first structure
export type ReferenceGenomes = SegmentFirstReferenceGenomes;

// Lightweight schema for segment-first mode
export type ReferenceGenomesLightweightSchema = {
    segments: Record<SegmentName, {
        references: ReferenceName[];
        insdcAccessions: Record<ReferenceName, ReferenceAccession>;
        // Genes available for each reference in this segment
        genesByReference: Record<ReferenceName, GeneName[]>;
    }>;
};
