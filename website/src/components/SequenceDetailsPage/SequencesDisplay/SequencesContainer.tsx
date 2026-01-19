import { type Dispatch, type FC, type SetStateAction, useEffect, useState } from 'react';

import { SequencesViewer } from './SequenceViewer.tsx';
import { type ReferenceGenomes } from '../../../types/referencesGenomes.ts';
import type { ClientConfig } from '../../../types/runtimeConfig.ts';
import {
    alignedSequenceSegment,
    type GeneInfo,
    geneSequence,
    getSegmentAndGeneInfo,
    isAlignedSequence,
    isGeneSequence,
    isUnalignedSequence,
    type SegmentInfo,
    type SegmentReferenceSelections,
    type SequenceType,
    unalignedSequenceSegment,
} from '../../../utils/sequenceTypeHelpers.ts';
import { BoxWithTabsBox, BoxWithTabsTab, BoxWithTabsTabBar } from '../../common/BoxWithTabs.tsx';
import { Button } from '../../common/Button';
import { withQueryProvider } from '../../common/withQueryProvider.tsx';

type SequenceContainerProps = {
    organism: string;
    segmentReferences: SegmentReferenceSelections;
    accessionVersion: string;
    clientConfig: ClientConfig;
    referenceGenomes: ReferenceGenomes;
    loadSequencesAutomatically: boolean;
};

export const InnerSequencesContainer: FC<SequenceContainerProps> = ({
    organism,
    segmentReferences,
    accessionVersion,
    clientConfig,
    referenceGenomes,
    loadSequencesAutomatically,
}) => {
    const { nucleotideSegmentInfos, geneInfos } = getSegmentAndGeneInfo(referenceGenomes, segmentReferences);

    const [loadSequences, setLoadSequences] = useState(() => loadSequencesAutomatically);
    const [sequenceType, setSequenceType] = useState<SequenceType>(unalignedSequenceSegment(nucleotideSegmentInfos[0]));

    if (!loadSequences) {
        return (
            <Button className='btn btn-sm m-4' onClick={() => setLoadSequences(true)}>
                Load sequences
            </Button>
        );
    }

    return (
        <SequenceTabs
            organism={organism}
            accessionVersion={accessionVersion}
            clientConfig={clientConfig}
            segments={nucleotideSegmentInfos}
            sequenceType={sequenceType}
            setType={setSequenceType}
            genes={geneInfos}
            isMultiSegmented={referenceGenomes.isMultiSegmented}
        />
    );
};

export const SequencesContainer = withQueryProvider(InnerSequencesContainer);

type SequenceTabsProps = {
    organism: string;
    accessionVersion: string;
    clientConfig: ClientConfig;
    segments: SegmentInfo[];
    sequenceType: SequenceType;
    setType: Dispatch<SetStateAction<SequenceType>>;
    genes: GeneInfo[];
    isMultiSegmented: boolean;
};

const SequenceTabs: FC<SequenceTabsProps> = ({
    organism,
    accessionVersion,
    clientConfig,
    segments,
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
                    segments={segments}
                    sequenceType={sequenceType}
                    setType={setType}
                    isActive={activeTab === 'unaligned'}
                    setActiveTab={setActiveTab}
                />
                <AlignmentSequenceTabs
                    segments={segments}
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
    segments: SegmentInfo[];
    sequenceType: SequenceType;
    setType: Dispatch<SetStateAction<SequenceType>>;
    isActive: boolean;
    setActiveTab: (tab: 'unaligned' | 'aligned' | 'gene') => void;
};

const UnalignedNucleotideSequenceTabs: FC<NucleotideSequenceTabsProps> = ({
    segments,
    sequenceType,
    setType,
    isActive,
    setActiveTab,
}) => {
    if (segments.length === 1) {
        const onlySegment = segments[0];
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
            {segments.map((segmentName) => (
                <BoxWithTabsTab
                    key={segmentName.lapisName}
                    isActive={
                        isActive && isUnalignedSequence(sequenceType) && segmentName.name === sequenceType.name.name
                    }
                    onClick={() => {
                        setType(unalignedSequenceSegment(segmentName));
                        setActiveTab('unaligned');
                    }}
                    label={`${segmentName.name} (unaligned)`}
                />
            ))}
        </>
    );
};

const AlignmentSequenceTabs: FC<NucleotideSequenceTabsProps> = ({
    segments,
    sequenceType,
    setType,
    isActive,
    setActiveTab,
}) => {
    if (segments.length === 1) {
        const onlySegment = segments[0];
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
            {segments.map((segmentName) => (
                <BoxWithTabsTab
                    key={segmentName.lapisName}
                    isActive={
                        isActive && isAlignedSequence(sequenceType) && segmentName.name === sequenceType.name.name
                    }
                    onClick={() => {
                        setType(alignedSequenceSegment(segmentName));
                        setActiveTab('aligned');
                    }}
                    label={`${segmentName.name} (aligned)`}
                />
            ))}
        </>
    );
};

type GeneDropdownProps = {
    genes: GeneInfo[];
    sequenceType: SequenceType;
    setType: Dispatch<SetStateAction<SequenceType>>;
};

const GeneDropdown: FC<GeneDropdownProps> = ({ genes, sequenceType, setType }) => {
    const selectedGene = isGeneSequence(sequenceType.name, sequenceType) ? sequenceType.name.name : '';

    return (
        <div className='mb-4'>
            <select
                data-testid='gene-dropdown'
                className='select select-bordered w-full max-w-xs'
                value={selectedGene}
                onChange={(e) => {
                    const name = e.target.value;
                    const gene = genes.find((gene) => gene.name === name);
                    if (gene !== undefined) {
                        setType(geneSequence(gene));
                    }
                }}
            >
                <option value='' disabled>
                    Select a gene
                </option>
                {genes.map((gene) => (
                    <option key={gene.name} value={gene.name}>
                        {gene.name}
                    </option>
                ))}
            </select>
        </div>
    );
};
