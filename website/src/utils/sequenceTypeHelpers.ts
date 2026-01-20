import type {
    ReferenceAccession,
    ReferenceGenomes,
    ReferenceGenomesSchema,
    ReferenceName,
    SegmentName,
    SegmentReferenceGenomes,
} from '../types/referencesGenomes';

export type SequenceType =
    | { type: 'nucleotide'; aligned: boolean; name: SegmentInfo }
    | { type: 'aminoAcid'; aligned: true; name: GeneInfo };
export type BaseType = SequenceType['type'];

export type SegmentInfo = {
    /** the segment name as it is called in LAPIS */
    lapisName: string;
    /** the segment name as it should be displayed in the UI */
    name: string;
};

export type GeneInfo = {
    /** the gene name as it is called in LAPIS */
    lapisName: string;
    /** the gene name as it should be displayed in the UI */
    name: string;
};

export type SegmentAndGeneInfo = {
    nucleotideSegmentInfos: SegmentInfo[];
    geneInfos: GeneInfo[];
};

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

export type SegmentReferenceSelections = Record<SegmentName, ReferenceName | null>;

export function getSegmentLapisName(
    segmentName: string,
    referenceName: string,
    isMultiSegmented: boolean,
    isMultiReferenced: boolean,
): string {
    if (!isMultiReferenced) {
        return segmentName;
    }
    if (isMultiSegmented) {
        return `${segmentName}-${referenceName}`;
    }
    return referenceName;
}

export function getGeneLapisName(geneName: string, referenceName: string, isMultiReferenced: boolean): string {
    if (!isMultiReferenced) {
        return geneName;
    }
    return `${geneName}-${referenceName}`;
}

export function toReferenceGenomes(values: ReferenceGenomesSchema): ReferenceGenomes {
    const genomes: SegmentReferenceGenomes = {};

    const isMultiSegmented = (values?.length ?? 0) > 1;
    let useLapisMultiSegmentedEndpoint = isMultiSegmented;

    for (const segmentData of values ?? []) {
        const segmentName = segmentData.name;
        const isMultiReferenced = segmentData.references.length > 1;

        genomes[segmentName] ??= {};

        if (isMultiReferenced) {
            useLapisMultiSegmentedEndpoint = true;
        }

        for (const ref of segmentData.references) {
            genomes[segmentName][ref.reference_name] = {
                lapisName: getSegmentLapisName(segmentName, ref.reference_name, isMultiSegmented, isMultiReferenced),
                insdcAccessionFull: ref.insdcAccessionFull ?? null,
                genes: ref.genes
                    ? ref.genes.map((gene) => ({
                          name: gene.name,
                          lapisName: getGeneLapisName(gene.name, ref.reference_name, isMultiReferenced),
                      }))
                    : [],
            };
        }
    }

    return {
        segmentReferenceGenomes: genomes,
        isMultiSegmented,
        useLapisMultiSegmentedEndpoint,
    };
}

export const getSegmentNames = (genomes: ReferenceGenomes) =>
    Object.keys(genomes.segmentReferenceGenomes) as SegmentName[];

/**
 * Get segment and gene info where each segment can have its own reference.
 * @param schema - The reference genome lightweight schema
 * @param selectedReferences - Map of segment names to selected references
 * @returns SegmentAndGeneInfo with all segments and their genes
 */
export function getSegmentAndGeneInfo(
    referenceGenomes: ReferenceGenomes,
    selectedReferences: SegmentReferenceSelections,
): SegmentAndGeneInfo {
    const nucleotideSegmentInfos: SegmentInfo[] = [];
    const geneInfos: GeneInfo[] = [];

    for (const [segmentName, segmentData] of Object.entries(referenceGenomes.segmentReferenceGenomes)) {
        const isSingleReference = Object.keys(segmentData).length === 1;
        const selectedRef = selectedReferences[segmentName] ?? null;

        if (isSingleReference) {
            nucleotideSegmentInfos.push({ name: segmentName, lapisName: segmentName });
            geneInfos.push(...segmentData[Object.keys(segmentData)[0]].genes);
            continue;
        }
        if (!selectedRef) {
            continue;
        }
        nucleotideSegmentInfos.push({ name: segmentName, lapisName: segmentData[selectedRef].lapisName });
        geneInfos.push(...segmentData[selectedRef].genes);
    }

    return {
        nucleotideSegmentInfos,
        geneInfos,
    };
}

export function getInsdcAccessionsFromSegmentReferences(
    referenceGenomes: ReferenceGenomes,
    segmentReferences: SegmentReferenceSelections,
): ReferenceAccession[] {
    const references: ReferenceAccession[] = [];
    for (const [segmentName, referenceName] of Object.entries(segmentReferences)) {
        const segmentData = referenceGenomes.segmentReferenceGenomes[segmentName];
        let reference = referenceName;
        if (!segmentsWithMultipleReferences(referenceGenomes).includes(segmentName)) {
            reference = Object.keys(segmentData)[0];
        }
        if (reference === null) {
            continue;
        }
        const accession = segmentData?.[reference].insdcAccessionFull;
        references.push({
            name: segmentName,
            ...(accession !== null && { insdcAccessionFull: accession }),
        });
    }
    return references;
}

export function lapisNameToDisplayName(referenceGenomes: ReferenceGenomes): Map<string, string | undefined> {
    const map = new Map<string, string | undefined>();
    for (const [segmentName, segmentData] of Object.entries(referenceGenomes.segmentReferenceGenomes)) {
        for (const refData of Object.values(segmentData)) {
            map.set(refData.lapisName, referenceGenomes.isMultiSegmented ? segmentName : undefined);
            for (const gene of refData.genes) {
                map.set(gene.lapisName, gene.name);
            }
        }
    }
    return map;
}

export function segmentsWithMultipleReferences(referenceGenomes: ReferenceGenomes) {
    return getSegmentNames(referenceGenomes).filter(
        (segment) => Object.keys(referenceGenomes.segmentReferenceGenomes[segment]).length > 1,
    );
}

export function stillRequiresReferenceNameSelection(
    selectedReferenceNames: SegmentReferenceSelections,
    referenceGenomes: ReferenceGenomes,
) {
    return segmentsWithMultipleReferences(referenceGenomes).some((segment) => selectedReferenceNames[segment] === null);
}
