import type { ReferenceGenomesInfo } from './referencesGenomes';

export const SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES: ReferenceGenomesInfo = {
    segmentReferenceGenomes: {
        main: {
            singleReference: {
                lapisName: 'main',
                insdcAccessionFull: 'defaultInsdcAccession',
                genes: [
                    { lapisName: 'gene1', name: 'gene1' },
                    { lapisName: 'gene2', name: 'gene2' },
                ],
            },
        },
    },
    isMultiSegmented: false,
    useLapisMultiSegmentedEndpoint: false,
};

export const MULTI_SEG_SINGLE_REF_REFERENCEGENOMES: ReferenceGenomesInfo = {
    segmentReferenceGenomes: {
        S: {
            singleReference: {
                lapisName: 'S',
                insdcAccessionFull: 'defaultInsdcAccession1',
                genes: [{ lapisName: 'gene1', name: 'gene1' }],
            },
        },
        L: {
            singleReference: {
                lapisName: 'L',
                insdcAccessionFull: 'defaultInsdcAccession2',
                genes: [{ lapisName: 'gene2', name: 'gene2' }],
            },
        },
    },
    isMultiSegmented: true,
    useLapisMultiSegmentedEndpoint: false,
};

export const SINGLE_SEG_MULTI_REF_REFERENCEGENOMES: ReferenceGenomesInfo = {
    segmentReferenceGenomes: {
        main: {
            ref1: {
                lapisName: 'ref1',
                insdcAccessionFull: 'defaultInsdcAccession1',
                genes: [
                    { lapisName: 'gene1-ref1', name: 'gene1' },
                    { lapisName: 'gene2-ref1', name: 'gene2' },
                ],
            },
            ref2: {
                lapisName: 'ref2',
                insdcAccessionFull: 'defaultInsdcAccession2',
                genes: [
                    { lapisName: 'gene1-ref2', name: 'gene1' },
                    { lapisName: 'gene2-ref2', name: 'gene2' },
                ],
            },
        },
    },
    isMultiSegmented: false,
    useLapisMultiSegmentedEndpoint: true,
};
