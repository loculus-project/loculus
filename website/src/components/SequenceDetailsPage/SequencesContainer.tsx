import { type Dispatch, type FC, type SetStateAction, useEffect, useState } from 'react';

import { SequencesViewer } from './SequenceViewer';
import {
    type ReferenceGenomesSequenceNames,
    SINGLE_REFERENCE,
    type Suborganism,
} from '../../types/referencesGenomes.ts';
import type { ClientConfig } from '../../types/runtimeConfig';
import {
    alignedSequenceSegment,
    geneSequence,
    isAlignedSequence,
    isGeneSequence,
    isUnalignedSequence,
    type SequenceType,
    unalignedSequenceSegment,
} from '../../utils/sequenceTypeHelpers';
import { BoxWithTabsBox, BoxWithTabsTab, BoxWithTabsTabBar } from '../common/BoxWithTabs.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

type SequenceName = {
    lapisName: string;
    label: string;
};

type SequenceContainerProps = {
    organism: string;
    suborganism: Suborganism;
    accessionVersion: string;
    clientConfig: ClientConfig;
    referenceGenomeSequenceNames: ReferenceGenomesSequenceNames;
    loadSequencesAutomatically: boolean;
};

export const InnerSequencesContainer: FC<SequenceContainerProps> = ({
    organism,
    suborganism,
    accessionVersion,
    clientConfig,
    referenceGenomeSequenceNames,
    loadSequencesAutomatically,
}) => {
    const { nucleotideSegmentNames, genes, isMultiSegmented } = getSequenceNames(
        referenceGenomeSequenceNames,
        suborganism,
    );

    const [loadSequences, setLoadSequences] = useState(false);
    useEffect(() => {
        if (loadSequencesAutomatically) {
            setLoadSequences(true);
        }
    }, [loadSequencesAutomatically]);
    const [sequenceType, setSequenceType] = useState<SequenceType>(unalignedSequenceSegment(nucleotideSegmentNames[0]));

    if (!loadSequences) {
        return (
            <button className='btn btn-sm m-4' onClick={() => setLoadSequences(true)}>
                Load sequences
            </button>
        );
    }

    return (
        <SequenceTabs
            organism={organism}
            accessionVersion={accessionVersion}
            clientConfig={clientConfig}
            nucleotideSegmentNames={nucleotideSegmentNames}
            sequenceType={sequenceType}
            setType={setSequenceType}
            genes={genes}
            isMultiSegmented={isMultiSegmented}
        />
    );
};

export const SequencesContainer = withQueryProvider(InnerSequencesContainer);

function getSequenceNames(
    referenceGenomeSequenceNames: ReferenceGenomesSequenceNames,
    suborganism: string,
): {
    nucleotideSegmentNames: SequenceName[];
    genes: SequenceName[];
    isMultiSegmented: boolean;
} {
    const { nucleotideSequences, genes } = referenceGenomeSequenceNames[suborganism];

    if (suborganism === SINGLE_REFERENCE) {
        return {
            nucleotideSegmentNames: nucleotideSequences.map((name) => ({ lapisName: name, label: name })),
            genes: genes.map((name) => ({ lapisName: name, label: name })),
            isMultiSegmented: isMultiSegmented(nucleotideSequences),
        };
    }

    const nucleotideSegmentNames =
        nucleotideSequences.length === 1
            ? [{ lapisName: suborganism, label: 'main' }]
            : nucleotideSequences.map((name) => ({
                  lapisName: `${suborganism}-${name}`,
                  label: name,
              }));

    return {
        nucleotideSegmentNames,
        genes: genes.map((name) => ({
            lapisName: `${suborganism}-${name}`,
            label: name,
        })),
        isMultiSegmented: true,
    };
}

type SequenceTabsProps = {
    organism: string;
    accessionVersion: string;
    clientConfig: ClientConfig;
    nucleotideSegmentNames: SequenceName[];
    sequenceType: SequenceType;
    setType: Dispatch<SetStateAction<SequenceType>>;
    genes: SequenceName[];
    isMultiSegmented: boolean;
};

const SequenceTabs: FC<SequenceTabsProps> = ({
    organism,
    accessionVersion,
    clientConfig,
    nucleotideSegmentNames,
    genes,
    sequenceType,
    setType,
    isMultiSegmented,
}) => {
    const [activeTab, setActiveTab] = useState<'unaligned' | 'aligned' | 'gene'>('unaligned');

    useEffect(() => {
        if (isUnalignedSequence(sequenceType)) {
            setActiveTab('unaligned');
        } else if (isAlignedSequence(sequenceType)) {
            setActiveTab('aligned');
        } else if (isGeneSequence(sequenceType.name, sequenceType)) {
            setActiveTab('gene');
        }
    }, [sequenceType]);

    return (
        <>
            <BoxWithTabsTabBar>
                <UnalignedNucleotideSequenceTabs
                    nucleotideSegmentNames={nucleotideSegmentNames}
                    sequenceType={sequenceType}
                    setType={setType}
                    isActive={activeTab === 'unaligned'}
                    setActiveTab={setActiveTab}
                />
                <AlignmentSequenceTabs
                    nucleotideSegmentNames={nucleotideSegmentNames}
                    sequenceType={sequenceType}
                    setType={setType}
                    isActive={activeTab === 'aligned'}
                    setActiveTab={setActiveTab}
                />
                <BoxWithTabsTab
                    isActive={activeTab === 'gene'}
                    label='Aligned amino acid sequences'
                    onClick={() => setActiveTab('gene')}
                />
            </BoxWithTabsTabBar>
            <BoxWithTabsBox>
                {activeTab === 'gene' && <GeneDropdown genes={genes} sequenceType={sequenceType} setType={setType} />}
                {activeTab !== 'gene' || isGeneSequence(sequenceType.name, sequenceType) ? (
                    <SequencesViewer
                        organism={organism}
                        accessionVersion={accessionVersion}
                        clientConfig={clientConfig}
                        sequenceType={sequenceType}
                        isMultiSegmented={isMultiSegmented}
                    />
                ) : (
                    <div className='h-80'></div>
                )}
            </BoxWithTabsBox>
        </>
    );
};

type NucleotideSequenceTabsProps = {
    nucleotideSegmentNames: SequenceName[];
    sequenceType: SequenceType;
    setType: Dispatch<SetStateAction<SequenceType>>;
    isActive: boolean;
    setActiveTab: (tab: 'unaligned' | 'aligned' | 'gene') => void;
};

const UnalignedNucleotideSequenceTabs: FC<NucleotideSequenceTabsProps> = ({
    nucleotideSegmentNames,
    sequenceType,
    setType,
    isActive,
    setActiveTab,
}) => {
    if (!isMultiSegmented(nucleotideSegmentNames)) {
        const onlySegment = nucleotideSegmentNames[0];
        return (
            <BoxWithTabsTab
                key={onlySegment.lapisName}
                isActive={isActive}
                onClick={() => {
                    setType(unalignedSequenceSegment(onlySegment));
                    setActiveTab('unaligned');
                }}
                label='Nucleotide sequence'
            />
        );
    }

    return (
        <>
            {nucleotideSegmentNames.map((segmentName) => (
                <BoxWithTabsTab
                    key={segmentName.lapisName}
                    isActive={isActive && isUnalignedSequence(sequenceType) && segmentName === sequenceType.name}
                    onClick={() => {
                        setType(unalignedSequenceSegment(segmentName));
                        setActiveTab('unaligned');
                    }}
                    label={`${segmentName.label} (unaligned)`}
                />
            ))}
        </>
    );
};

const AlignmentSequenceTabs: FC<NucleotideSequenceTabsProps> = ({
    nucleotideSegmentNames,
    sequenceType,
    setType,
    isActive,
    setActiveTab,
}) => {
    if (!isMultiSegmented(nucleotideSegmentNames)) {
        const onlySegment = nucleotideSegmentNames[0];
        return (
            <BoxWithTabsTab
                key={onlySegment.lapisName}
                isActive={isActive}
                onClick={() => {
                    setType(alignedSequenceSegment(onlySegment));
                    setActiveTab('aligned');
                }}
                label='Aligned nucleotide sequence'
            />
        );
    }

    return (
        <>
            {nucleotideSegmentNames.map((segmentName) => (
                <BoxWithTabsTab
                    key={segmentName.lapisName}
                    isActive={isActive && isAlignedSequence(sequenceType) && segmentName === sequenceType.name}
                    onClick={() => {
                        setType(alignedSequenceSegment(segmentName));
                        setActiveTab('aligned');
                    }}
                    label={`${segmentName.label} (aligned)`}
                />
            ))}
        </>
    );
};

type GeneDropdownProps = {
    genes: SequenceName[];
    sequenceType: SequenceType;
    setType: Dispatch<SetStateAction<SequenceType>>;
};

const GeneDropdown: FC<GeneDropdownProps> = ({ genes, sequenceType, setType }) => {
    const selectedGene = isGeneSequence(sequenceType.name, sequenceType) ? sequenceType.name.label : '';

    return (
        <div className='mb-4'>
            <select
                className='select select-bordered w-full max-w-xs'
                value={selectedGene}
                onChange={(e) => {
                    const label = e.target.value;
                    const gene = genes.find((gene) => gene.label === label);
                    if (gene !== undefined) {
                        setType(geneSequence(gene));
                    }
                }}
            >
                <option value='' disabled>
                    Select a gene
                </option>
                {genes.map((gene) => (
                    <option key={gene.label} value={gene.label}>
                        {gene.label}
                    </option>
                ))}
            </select>
        </div>
    );
};

function isMultiSegmented(nucleotideSegmentNames: unknown[]) {
    return nucleotideSegmentNames.length > 1;
}
