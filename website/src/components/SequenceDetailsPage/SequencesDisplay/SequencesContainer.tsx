import { type Dispatch, type FC, type SetStateAction, useEffect, useState } from 'react';

import { SequencesViewer } from './SequenceViewer.tsx';
import { type ReferenceGenomesInfo } from '../../../types/referencesGenomes.ts';
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
import { Select } from '../../common/Select.tsx';
import { withQueryProvider } from '../../common/withQueryProvider.tsx';

type SequenceContainerProps = {
    organism: string;
    segmentReferences?: SegmentReferenceSelections;
    accessionVersion: string;
    clientConfig: ClientConfig;
    referenceGenomesInfo: ReferenceGenomesInfo;
    loadSequencesAutomatically: boolean;
};

export const InnerSequencesContainer: FC<SequenceContainerProps> = ({
    organism,
    segmentReferences,
    accessionVersion,
    clientConfig,
    referenceGenomesInfo,
    loadSequencesAutomatically,
}) => {
    const { nucleotideSegmentInfos, geneInfos } = getSegmentAndGeneInfo(referenceGenomesInfo, segmentReferences);

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
            useLapisMultiSegmentedEndpoint={referenceGenomesInfo.useLapisMultiSegmentedEndpoint}
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
    useLapisMultiSegmentedEndpoint: boolean;
};

const SequenceTabs: FC<SequenceTabsProps> = ({
    organism,
    accessionVersion,
    clientConfig,
    segments,
    genes,
    sequenceType,
    setType,
    useLapisMultiSegmentedEndpoint,
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
                {segments.length > 1 && activeTab === 'unaligned' && (
                    <SegmentDropdown
                        segments={segments}
                        sequenceType={sequenceType}
                        setType={setType}
                        mode='unaligned'
                    />
                )}
                {segments.length > 1 && activeTab === 'aligned' && (
                    <SegmentDropdown segments={segments} sequenceType={sequenceType} setType={setType} mode='aligned' />
                )}
                {activeTab !== 'gene' || isGeneSequence(sequenceType.name, sequenceType) ? (
                    <SequencesViewer
                        organism={organism}
                        accessionVersion={accessionVersion}
                        clientConfig={clientConfig}
                        sequenceType={sequenceType}
                        useLapisMultiSegmentedEndpoint={useLapisMultiSegmentedEndpoint}
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

const getCurrentSegment = (segments: SegmentInfo[], sequenceType: SequenceType): SegmentInfo => {
    if (isUnalignedSequence(sequenceType) || isAlignedSequence(sequenceType)) {
        return segments.find((s) => s.name === sequenceType.name.name) ?? segments[0];
    }
    return segments[0];
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
        <BoxWithTabsTab
            isActive={isActive}
            onClick={() => {
                if (!isActive) setType(unalignedSequenceSegment(getCurrentSegment(segments, sequenceType)));
                setActiveTab('unaligned');
            }}
            label='Nucleotide sequences'
        />
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
        <BoxWithTabsTab
            isActive={isActive}
            onClick={() => {
                if (!isActive) setType(alignedSequenceSegment(getCurrentSegment(segments, sequenceType)));
                setActiveTab('aligned');
            }}
            label='Aligned nucleotide sequences'
        />
    );
};

type SegmentDropdownProps = {
    segments: SegmentInfo[];
    sequenceType: SequenceType;
    setType: Dispatch<SetStateAction<SequenceType>>;
    mode: 'unaligned' | 'aligned';
};

const SegmentDropdown: FC<SegmentDropdownProps> = ({ segments, sequenceType, setType, mode }) => {
    const currentSegmentName =
        isUnalignedSequence(sequenceType) || isAlignedSequence(sequenceType) ? sequenceType.name.name : '';

    return (
        <div className='mb-4'>
            <Select
                className='select select-bordered w-full max-w-xs'
                value={currentSegmentName}
                onChange={(e) => {
                    const segment = segments.find((s) => s.name === e.target.value);
                    if (segment !== undefined) {
                        setType(
                            mode === 'unaligned' ? unalignedSequenceSegment(segment) : alignedSequenceSegment(segment),
                        );
                    }
                }}
            >
                {segments.map((segment) => (
                    <option key={segment.lapisName} value={segment.name}>
                        {segment.displayName ?? segment.name}
                    </option>
                ))}
            </Select>
        </div>
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
            <Select
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
            </Select>
        </div>
    );
};
