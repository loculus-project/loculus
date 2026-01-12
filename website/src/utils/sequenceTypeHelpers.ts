export type SequenceType =
    | { type: 'nucleotide'; aligned: boolean; name: SegmentInfo }
    | { type: 'aminoAcid'; aligned: true; name: GeneInfo };
export type BaseType = SequenceType['type'];

export type SegmentInfo = {
    /** the segment name as it is called in LAPIS */
    lapisName: string;
    /** the segment name as it should be displayed in the UI */
    label: string;
};

export type GeneInfo = {
    /** the gene name as it is called in LAPIS */
    lapisName: string;
    /** the gene name as it should be displayed in the UI */
    label: string;
};

export function getMultiPathogenNucleotideSequenceNames(nucleotideSequences: string[], suborganism: string) {
    return nucleotideSequences.length === 1
        ? [{ lapisName: suborganism, label: 'main' }]
        : nucleotideSequences.map((name) => getMultiPathogenSequenceName(name, suborganism));
}

export function getSinglePathogenSequenceName(name: string): SegmentInfo | GeneInfo {
    return {
        lapisName: name,
        label: name,
    };
}

export function getMultiPathogenSequenceName(segment: string, reference: string): SegmentInfo | GeneInfo {
    return {
        lapisName: `${segment}-${reference}`,
        label: segment,
    };
}

export function isMultiSegmented(nucleotideSegmentNames: unknown[]) {
    return nucleotideSegmentNames.length > 1;
}

export const unalignedSequenceSegment = (segmentInfo: SegmentInfo): SequenceType => ({
    type: 'nucleotide',
    aligned: false,
    name: segmentInfo,
});

export const alignedSequenceSegment = (segmentInfo: SegmentInfo): SequenceType => ({
    type: 'nucleotide',
    aligned: true,
    name: segmentInfo,
});

export const geneSequence = (geneInfo: GeneInfo): SequenceType => ({
    type: 'aminoAcid',
    aligned: true,
    name: geneInfo,
});
export const isUnalignedSequence = (type: SequenceType): boolean => type.type === 'nucleotide' && !type.aligned;
export const isAlignedSequence = (type: SequenceType): boolean => type.type === 'nucleotide' && type.aligned;
export const isGeneSequence = (segmentOrGeneInfo: SegmentInfo | GeneInfo, type: SequenceType): boolean =>
    type.type === 'aminoAcid' && type.name.lapisName === segmentOrGeneInfo.lapisName;

// NEW: Segment-first mode helpers
export type SegmentReferenceSelections = Record<string, string | null>;

/**
 * Get segment info for segment-first mode where each segment can have its own reference.
 * @param segmentName - The segment name (e.g., "main", "VP4")
 * @param referenceName - The selected reference for this segment (e.g., "CV-A16"), or null
 * @returns SegmentInfo with appropriate LAPIS naming
 */
export function getSegmentInfoWithReference(segmentName: string, referenceName: string | null): SegmentInfo {
    if (referenceName === null) {
        // No reference selected - use segment name as-is
        return {
            lapisName: segmentName,
            label: segmentName,
        };
    }
    // Reference selected - prefix with reference name for LAPIS
    return {
        lapisName: `${referenceName}-${segmentName}`,
        label: segmentName,
    };
}

/**
 * Get gene info for segment-first mode.
 * @param geneName - The gene name (e.g., "VP4")
 * @param referenceName - The reference name (e.g., "CV-A16")
 * @returns GeneInfo with appropriate LAPIS naming
 */
export function getGeneInfoWithReference(geneName: string, referenceName: string | null): GeneInfo {
    if (referenceName === null) {
        // No reference selected - use gene name as-is
        return {
            lapisName: geneName,
            label: geneName,
        };
    }
    // Reference selected - prefix with reference name for LAPIS
    return {
        lapisName: `${referenceName}-${geneName}`,
        label: geneName,
    };
}

export function stillRequiresReferenceNameSelection(
    selectedReferenceNames: Record<string, string | undefined>,
) {
    return Object.values(selectedReferenceNames).some((value) => value === undefined);
}
