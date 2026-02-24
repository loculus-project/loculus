import type {
    ReferenceAccession,
    ReferenceGenomesInfo,
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

export type SegmentLapisNames = {
    /** the segment name as it is called in LAPIS */
    lapisNames: string[];
    /** the segment name as it should be displayed in the UI */
    name: string;
};

export type GeneInfo = {
    /** the gene name as it is called in LAPIS */
    lapisName: string;
    /** the gene name as it should be displayed in the UI */
    name: string;
    segmentName?: string;
};

export type SegmentAndGeneInfo = {
    nucleotideSegmentInfos: SegmentInfo[];
    geneInfos: GeneInfo[];
    useLapisMultiSegmentedEndpoint?: boolean;
    multiSegmented?: boolean;
};

export type SingleSegmentAndGeneInfo = {
    nucleotideSegmentInfo: SegmentInfo;
    geneInfos: GeneInfo[];
    useLapisMultiSegmentedEndpoint?: boolean;
    multiSegmented?: boolean;
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

export function toReferenceGenomes(values: ReferenceGenomesSchema): ReferenceGenomesInfo {
    const genomes: SegmentReferenceGenomes = {};
    const segmentDisplayNames: Record<SegmentName, string> = {};

    const isMultiSegmented = (values?.length ?? 0) > 1;
    let useLapisMultiSegmentedEndpoint = isMultiSegmented;

    for (const segmentData of values ?? []) {
        const segmentName = segmentData.name;
        const isMultiReferenced = segmentData.references.length > 1;

        genomes[segmentName] ??= {};
        if (segmentData.displayName) segmentDisplayNames[segmentName] = segmentData.displayName;

        if (isMultiReferenced) {
            useLapisMultiSegmentedEndpoint = true;
        }

        for (const ref of segmentData.references) {
            genomes[segmentName][ref.name] = {
                lapisName: getSegmentLapisName(segmentName, ref.name, isMultiSegmented, isMultiReferenced),
                insdcAccessionFull: ref.insdcAccessionFull ?? null,
                genes: ref.genes
                    ? ref.genes.map((gene) => ({
                          name: gene.name,
                          lapisName: getGeneLapisName(gene.name, ref.name, isMultiReferenced),
                      }))
                    : [],
                displayName: ref.displayName,
            };
        }
    }

    return {
        segmentReferenceGenomes: genomes,
        isMultiSegmented,
        useLapisMultiSegmentedEndpoint,
        segmentDisplayNames,
    };
}

export const getSegmentNames = (genomes: ReferenceGenomesInfo) => Object.keys(genomes.segmentReferenceGenomes);

export function getReferenceNames(info: ReferenceGenomesInfo): ReferenceName[] {
    const names = new Set<ReferenceName>();

    for (const referenceGenomeMap of Object.values(info.segmentReferenceGenomes)) {
        for (const referenceName of Object.keys(referenceGenomeMap)) {
            names.add(referenceName);
        }
    }

    return Array.from(names);
}

/**
 * Get segment and gene info where each segment can have its own reference.
 * @param referenceGenomesInfo - The reference genome lightweight schema
 * @param selectedReferences - Map of segment names to selected references
 * @returns SegmentAndGeneInfo with all segments and their genes
 */
export function getSegmentAndGeneInfo(
    referenceGenomesInfo: ReferenceGenomesInfo,
    selectedReferences?: SegmentReferenceSelections,
): SegmentAndGeneInfo {
    const nucleotideSegmentInfos: SegmentInfo[] = [];
    const geneInfos: GeneInfo[] = [];

    for (const [segmentName, segmentData] of Object.entries(referenceGenomesInfo.segmentReferenceGenomes)) {
        const isSingleReference = Object.keys(segmentData).length === 1;
        const selectedRef = selectedReferences?.[segmentName] ?? null;

        if (isSingleReference) {
            nucleotideSegmentInfos.push({ name: segmentName, lapisName: segmentName });
            geneInfos.push(...segmentData[Object.keys(segmentData)[0]].genes.map((gene) => ({ ...gene, segmentName })));
            continue;
        }
        if (!selectedRef || !(selectedRef in segmentData)) {
            continue;
        }
        nucleotideSegmentInfos.push({ name: segmentName, lapisName: segmentData[selectedRef].lapisName });
        geneInfos.push(...segmentData[selectedRef].genes.map((gene) => ({ ...gene, segmentName })));
    }

    return {
        nucleotideSegmentInfos,
        geneInfos,
        useLapisMultiSegmentedEndpoint: referenceGenomesInfo.useLapisMultiSegmentedEndpoint,
        multiSegmented: referenceGenomesInfo.isMultiSegmented,
    };
}

/**
 * Get all lapis names for a specific segment, if a reference is selected filter the lapis names.
 * @param referenceGenomesInfo - The reference genome lightweight schema
 * @param selectedReferences - Map of segment names to selected references
 * @returns Array of SegmentLapisNames with all segments and their LAPIS names
 */
export function getSegmentLapisNames(
    referenceGenomesInfo: ReferenceGenomesInfo,
    selectedReferences?: SegmentReferenceSelections,
): SegmentLapisNames[] {
    const nucleotideSegmentInfos: SegmentLapisNames[] = [];

    for (const [segmentName, segmentData] of Object.entries(referenceGenomesInfo.segmentReferenceGenomes)) {
        const isSingleReference = Object.keys(segmentData).length === 1;
        if (isSingleReference) {
            nucleotideSegmentInfos.push({ name: segmentName, lapisNames: [segmentName] });
            continue;
        }

        const selectedRef = selectedReferences?.[segmentName] ?? null;
        if (!selectedRef || !(selectedRef in segmentData)) {
            nucleotideSegmentInfos.push({
                name: segmentName,
                lapisNames: Object.values(segmentData).map((info) => info.lapisName),
            });
            continue;
        }
        nucleotideSegmentInfos.push({ name: segmentName, lapisNames: [segmentData[selectedRef].lapisName] });
    }

    return nucleotideSegmentInfos;
}

export function getSingleSegmentAndGeneInfo(
    referenceGenomesInfo: ReferenceGenomesInfo,
    segment: string,
    selectedReferences?: SegmentReferenceSelections,
): SingleSegmentAndGeneInfo | null {
    const segmentData = referenceGenomesInfo.segmentReferenceGenomes[segment];

    const refs = Object.keys(segmentData);
    const selectedRef = refs.length === 1 ? refs[0] : selectedReferences?.[segment];

    if (!selectedRef || !(selectedRef in segmentData)) return null;

    const refData = segmentData[selectedRef];

    return {
        nucleotideSegmentInfo: { name: segment, lapisName: refData.lapisName },
        geneInfos: refData.genes.map((gene) => ({ ...gene, segmentName: segment })),
        useLapisMultiSegmentedEndpoint: referenceGenomesInfo.useLapisMultiSegmentedEndpoint,
        multiSegmented: referenceGenomesInfo.isMultiSegmented,
    };
}

export function getInsdcAccessionsFromSegmentReferences(
    referenceGenomesInfo: ReferenceGenomesInfo,
    segmentReferences?: SegmentReferenceSelections,
): ReferenceAccession[] {
    const references: ReferenceAccession[] = [];
    for (const [segmentName, segmentData] of Object.entries(referenceGenomesInfo.segmentReferenceGenomes)) {
        let referenceName = segmentReferences ? segmentReferences[segmentName] : null;
        if (!segmentsWithMultipleReferences(referenceGenomesInfo).includes(segmentName)) {
            referenceName = Object.keys(segmentData)[0];
        }
        if (referenceName === null) {
            continue;
        }
        const accession = segmentData[referenceName].insdcAccessionFull;
        references.push({
            name: segmentName,
            ...(accession !== null && { insdcAccessionFull: accession }),
        });
    }
    return references;
}

/**
 * @param referenceGenomesInfo - The reference genome lightweight schema
 * @returns Returns a map from LAPIS names to displayNames (segment or gene names).
 * For single-segmented genomes, the displayName is `undefined`.
 */
export function lapisNameToDisplayName(referenceGenomesInfo: ReferenceGenomesInfo): Map<string, string | undefined> {
    const map = new Map<string, string | undefined>();
    for (const [segmentName, segmentData] of Object.entries(referenceGenomesInfo.segmentReferenceGenomes)) {
        for (const refData of Object.values(segmentData)) {
            map.set(refData.lapisName, referenceGenomesInfo.isMultiSegmented ? segmentName : undefined);
            for (const gene of refData.genes) {
                map.set(gene.lapisName, gene.name);
            }
        }
    }
    return map;
}

export function segmentsWithMultipleReferences(referenceGenomesInfo: ReferenceGenomesInfo) {
    return getSegmentNames(referenceGenomesInfo).filter(
        (segment) => Object.keys(referenceGenomesInfo.segmentReferenceGenomes[segment]).length > 1,
    );
}

export function allReferencesSelected(
    referenceGenomesInfo: ReferenceGenomesInfo,
    selectedReferenceNames?: SegmentReferenceSelections,
): boolean {
    if (selectedReferenceNames === undefined) {
        return true;
    }
    return segmentsWithMultipleReferences(referenceGenomesInfo).every(
        (segment) => selectedReferenceNames[segment] !== null,
    );
}

export function segmentReferenceSelected(
    segmentName: SegmentName,
    referenceGenomesInfo: ReferenceGenomesInfo,
    selectedReferenceNames?: SegmentReferenceSelections,
): boolean {
    if (!segmentsWithMultipleReferences(referenceGenomesInfo).includes(segmentName)) {
        return true;
    }
    if (selectedReferenceNames === undefined) {
        return true;
    }
    return selectedReferenceNames[segmentName] !== null;
}
