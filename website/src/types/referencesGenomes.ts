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
            sequence: z.string(),
            insdcAccessionFull: z.string().optional(),
            genes: z.record(z.string(), z.object({ sequence: z.string() })).optional(),
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
                sequence: ref.sequence,
                ...(ref.insdcAccessionFull ? { insdcAccessionFull: ref.insdcAccessionFull } : {}),
                ...(ref.genes
                    ? {
                          genes: Object.fromEntries(ref.genes.map((g) => [g.name, { sequence: g.sequence }])),
                      }
                    : {}),
            };
        }
    }

    return ReferenceGenomesMap.parse(out);
}

// ============================================================================
// Shared utilities for reference detection and segment handling
// ============================================================================

/**
 * Get all segment names from the reference genomes map.
 */
export function getSegmentNames(referenceGenomesMap: ReferenceGenomesMap): string[] {
    return Object.keys(referenceGenomesMap);
}

/**
 * Check if a segment has multiple references (requires user selection).
 */
export function segmentHasMultipleReferences(
    referenceGenomesMap: ReferenceGenomesMap,
    segmentName: string,
): boolean {
    const segmentData = referenceGenomesMap[segmentName];
    return segmentData !== undefined && Object.keys(segmentData).length > 1;
}

/**
 * Get segments that have multiple references and require user selection.
 */
export function getSegmentsWithMultipleReferences(referenceGenomesMap: ReferenceGenomesMap): string[] {
    return getSegmentNames(referenceGenomesMap).filter((segment) =>
        segmentHasMultipleReferences(referenceGenomesMap, segment),
    );
}

/**
 * Check if all segments have exactly one reference (no selection needed).
 * Returns true when there's no need for user to select a reference.
 */
export function isSingleReferenceMode(referenceGenomesMap: ReferenceGenomesMap): boolean {
    return getSegmentsWithMultipleReferences(referenceGenomesMap).length === 0;
}

/**
 * Check if any segment with multiple references is missing a selection.
 * Returns true when user still needs to select a reference for some segment.
 */
export function requiresReferenceSelection(
    selectedReferences: Record<string, string | null>,
    referenceGenomesMap: ReferenceGenomesMap,
): boolean {
    const segmentsNeedingSelection = getSegmentsWithMultipleReferences(referenceGenomesMap);
    return segmentsNeedingSelection.some((segment) => selectedReferences[segment] == null);
}

/**
 * Get the single reference name for a segment (when in single-reference mode).
 * Returns null if the segment has multiple references or doesn't exist.
 */
export function getSingleReferenceName(
    referenceGenomesMap: ReferenceGenomesMap,
    segmentName: string,
): string | null {
    const segmentData = referenceGenomesMap[segmentName];
    if (segmentData === undefined) return null;
    const refs = Object.keys(segmentData);
    return refs.length === 1 ? refs[0] : null;
}

/**
 * Build a complete map of segment -> reference for all segments.
 * For single-reference segments, uses the only available reference.
 * For multi-reference segments, uses the provided selection (or null if not selected).
 */
export function buildSegmentReferencesMap(
    referenceGenomesMap: ReferenceGenomesMap,
    selectedReferences: Record<string, string | null>,
): Record<string, string | null> {
    const result: Record<string, string | null> = {};

    for (const segmentName of getSegmentNames(referenceGenomesMap)) {
        const singleRef = getSingleReferenceName(referenceGenomesMap, segmentName);
        if (singleRef !== null) {
            // Single reference mode for this segment - use the only available reference
            result[segmentName] = singleRef;
        } else {
            // Multiple references - use the user's selection
            result[segmentName] = selectedReferences[segmentName] ?? null;
        }
    }

    return result;
}
