import { type Dispatch, type FC, type SetStateAction, useState, useEffect } from 'react';

import { SequencesViewer } from './SequenceViewer';
import type { NucleotideSegmentNames } from '../../types/referencesGenomes.ts';
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
import { BoxWithTabsTabBar, BoxWithTabsTab, BoxWithTabsBox } from '../common/BoxWithTabs.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

type SequenceContainerProps = {
    organism: string;
    accessionVersion: string;
    clientConfig: ClientConfig;
    genes: string[];
    nucleotideSegmentNames: NucleotideSegmentNames;
    loadSequencesAutomatically: boolean;
};

export const InnerSequencesContainer: FC<SequenceContainerProps> = ({
    organism,
    accessionVersion,
    clientConfig,
    genes,
    nucleotideSegmentNames,
    loadSequencesAutomatically,
}) => {
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
        />
    );
};

export const SequencesContainer = withQueryProvider(InnerSequencesContainer);

type SequenceTabsProps = {
    organism: string;
    accessionVersion: string;
    clientConfig: ClientConfig;
    nucleotideSegmentNames: NucleotideSegmentNames;
    sequenceType: SequenceType;
    setType: Dispatch<SetStateAction<SequenceType>>;
    genes: string[];
};

const SequenceTabs: FC<SequenceTabsProps> = ({
    organism,
    accessionVersion,
    clientConfig,
    nucleotideSegmentNames,
    genes,
    sequenceType,
    setType,
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
                        isMultiSegmented={isMultiSegmented(nucleotideSegmentNames)}
                    />
                ) : (
                    <div className='h-80'></div>
                )}
            </BoxWithTabsBox>
        </>
    );
};

type NucleotideSequenceTabsProps = {
    nucleotideSegmentNames: NucleotideSegmentNames;
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
                key={onlySegment}
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
                    key={segmentName}
                    isActive={isActive && isUnalignedSequence(sequenceType) && segmentName === sequenceType.name}
                    onClick={() => {
                        setType(unalignedSequenceSegment(segmentName));
                        setActiveTab('unaligned');
                    }}
                    label={`${segmentName} (unaligned)`}
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
                key={onlySegment}
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
                    key={segmentName}
                    isActive={isActive && isAlignedSequence(sequenceType) && segmentName === sequenceType.name}
                    onClick={() => {
                        setType(alignedSequenceSegment(segmentName));
                        setActiveTab('aligned');
                    }}
                    label={`${segmentName} (aligned)`}
                />
            ))}
        </>
    );
};

type GeneDropdownProps = {
    genes: string[];
    sequenceType: SequenceType;
    setType: Dispatch<SetStateAction<SequenceType>>;
};

const GeneDropdown: FC<GeneDropdownProps> = ({ genes, sequenceType, setType }) => {
    const selectedGene = isGeneSequence(sequenceType.name, sequenceType) ? sequenceType.name : '';

    return (
        <div className='mb-4'>
            <select
                className='select select-bordered w-full max-w-xs'
                value={selectedGene}
                onChange={(e) => setType(geneSequence(e.target.value))}
            >
                <option value='' disabled>
                    Select a gene
                </option>
                {genes.map((gene) => (
                    <option key={gene} value={gene}>
                        {gene}
                    </option>
                ))}
            </select>
        </div>
    );
};

function isMultiSegmented(nucleotideSegmentNames: string[]) {
    return nucleotideSegmentNames.length > 1;
}
