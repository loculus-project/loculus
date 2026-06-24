// TS port of `_merged-reference-genomes.tpl`: flattens the canonical
// per-segment/per-reference shape into SILO's flat input.
import type { CanonicalOrganismConfig } from '../schema/canonicalConfig.ts';

export interface MergedReferenceGenomes {
    nucleotideSequences: { name: string; sequence: string }[];
    genes: { name: string; sequence: string }[];
}

export interface SegmentInfo {
    segments: string[];
    displayNames: Record<string, string>;
}

function nucleotideName(segmentName: string, referenceName: string, singleSegment: boolean, singleReference: boolean): string {
    if (singleReference) return segmentName;
    if (singleSegment) return referenceName;
    return `${segmentName}-${referenceName}`;
}

export function mergeReferenceGenomes(organism: CanonicalOrganismConfig): MergedReferenceGenomes {
    const segments = organism.referenceGenomes;
    if (segments === null || segments === undefined || segments.length === 0) {
        return {
            nucleotideSequences: organism.referenceGenome.nucleotideSequences.map((s) => ({
                name: s.name,
                sequence: s.sequence,
            })),
            genes: organism.referenceGenome.genes.map((g) => ({ name: g.name, sequence: g.sequence })),
        };
    }

    const nucleotideSequences: { name: string; sequence: string }[] = [];
    const genes: { name: string; sequence: string }[] = [];
    const singleSegment = segments.length === 1;

    for (const segment of segments) {
        const singleReference = segment.references.length === 1;
        for (const reference of segment.references) {
            const nucName = nucleotideName(segment.name, reference.name, singleSegment, singleReference);
            nucleotideSequences.push({ name: nucName, sequence: reference.sequence });

            if (reference.genes !== null && reference.genes !== undefined) {
                for (const gene of reference.genes) {
                    const geneName = singleReference ? gene.name : `${gene.name}-${reference.name}`;
                    genes.push({ name: geneName, sequence: gene.sequence });
                }
            }
        }
    }
    return { nucleotideSequences, genes };
}

export function getNucleotideSegmentInfo(organism: CanonicalOrganismConfig): SegmentInfo {
    const segments = organism.referenceGenomes;
    if (segments === null || segments === undefined || segments.length === 0) {
        const names = organism.referenceGenome.nucleotideSequences.map((s) => s.name);
        return {
            segments: [...names].sort(),
            displayNames: {},
        };
    }
    const segmentNames = segments.map((s) => s.name);
    const displayNames: Record<string, string> = {};
    for (const segment of segments) {
        if (segment.displayName !== null && segment.displayName !== undefined) {
            displayNames[segment.name] = segment.displayName;
        }
    }
    return { segments: [...segmentNames].sort(), displayNames };
}
