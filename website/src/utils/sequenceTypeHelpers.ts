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

export type GeneInfo = {
    /** the gene name as it is called in LAPIS */
    lapisName: string;
    /** the gene name as it should be displayed in the UI */
    name: string;
};

export type SegmentAndGeneInfo = {
    nucleotideSegmentInfos: SegmentInfo[];
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
            genomes[segmentName][ref.referenceName] = {
                lapisName: getSegmentLapisName(segmentName, ref.referenceName, isMultiSegmented, isMultiReferenced),
                insdcAccessionFull: ref.insdcAccessionFull ?? null,
                genes: ref.genes
                    ? ref.genes.map((gene) => ({
                          name: gene.name,
                          lapisName: getGeneLapisName(gene.name, ref.referenceName, isMultiReferenced),
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

export const getSegmentNames = (genomes: ReferenceGenomesInfo) => Object.keys(genomes.segmentReferenceGenomes);

/**
 * Get segment and gene info where each segment can have its own reference.
 * @param referenceGenomesInfo - The reference genome lightweight schema
 * @param selectedReferences - Map of segment names to selected references
 * @returns SegmentAndGeneInfo with all segments and their genes
 */
export function getSegmentAndGeneInfo(
    referenceGenomesInfo: ReferenceGenomesInfo,
    selectedReferences: SegmentReferenceSelections,
): SegmentAndGeneInfo {
    const nucleotideSegmentInfos: SegmentInfo[] = [];
    const geneInfos: GeneInfo[] = [];

    for (const [segmentName, segmentData] of Object.entries(referenceGenomesInfo.segmentReferenceGenomes)) {
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
        useLapisMultiSegmentedEndpoint: referenceGenomesInfo.useLapisMultiSegmentedEndpoint,
        multiSegmented: referenceGenomesInfo.isMultiSegmented,
    };
}

export function getInsdcAccessionsFromSegmentReferences(
    referenceGenomesInfo: ReferenceGenomesInfo,
    segmentReferences: SegmentReferenceSelections,
): ReferenceAccession[] {
    const references: ReferenceAccession[] = [];
    for (const [segmentName, referenceName] of Object.entries(segmentReferences)) {
        const segmentData = referenceGenomesInfo.segmentReferenceGenomes[segmentName];
        let reference = referenceName;
        if (!segmentsWithMultipleReferences(referenceGenomesInfo).includes(segmentName)) {
            reference = Object.keys(segmentData)[0];
        }
        if (reference === null) {
            continue;
        }
        const accession = segmentData[reference].insdcAccessionFull;
        references.push({
            name: segmentName,
            ...(accession !== null && { insdcAccessionFull: accession }),
        });
    }
    return references;
}

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

export function stillRequiresReferenceNameSelection(
    selectedReferenceNames: SegmentReferenceSelections,
    referenceGenomesInfo: ReferenceGenomesInfo,
) {
    return segmentsWithMultipleReferences(referenceGenomesInfo).some(
        (segment) => selectedReferenceNames[segment] === null,
    );
}
