import { type Dispatch, type FC, type SetStateAction, useState } from 'react';

import { SequencesViewer } from './SequenceViewer';
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
import { withQueryProvider } from '../common/withQueryProvider.tsx';

type SequenceContainerProps = {
    organism: string;
    accessionVersion: string;
    clientConfig: ClientConfig;
    genes: string[];
    nucleotideSegmentNames: [string, ...string[]];
};

export const InnerSequencesContainer: FC<SequenceContainerProps> = ({
    organism,
    accessionVersion,
    clientConfig,
    genes,
    nucleotideSegmentNames,
}) => {
    const [loadSequences, setLoadSequences] = useState(false);
    const [sequenceType, setSequenceType] = useState<SequenceType>(unalignedSequenceSegment(nucleotideSegmentNames[0]));

    if (!loadSequences) {
        return (
            <button className='btn btn-sm m-4' onClick={() => setLoadSequences(true)}>
                Load sequences
            </button>
        );
    }

    return (
        <>
            <SequenceTabs
                nucleotideSegmentNames={nucleotideSegmentNames}
                sequenceType={sequenceType}
                setType={setSequenceType}
                genes={genes}
            />
            <div className='border p-4 max-w-[1000px]'>
                <SequencesViewer
                    organism={organism}
                    accessionVersion={accessionVersion}
                    clientConfig={clientConfig}
                    sequenceType={sequenceType}
                    isMultiSegmented={isMultiSegmented(nucleotideSegmentNames)}
                />
            </div>
        </>
    );
};

export const SequencesContainer = withQueryProvider(InnerSequencesContainer);

type NucleotideSequenceTabsProps = {
    nucleotideSegmentNames: [string, ...string[]];
    sequenceType: SequenceType;
    setType: Dispatch<SetStateAction<SequenceType>>;
};

const SequenceTabs: FC<NucleotideSequenceTabsProps & { genes: string[] }> = ({
    nucleotideSegmentNames,
    genes,
    sequenceType,
    setType,
}) => (
    <div className='tabs -mb-px tabs-lifted flex flex-wrap'>
        <UnalignedNucleotideSequenceTabs
            nucleotideSegmentNames={nucleotideSegmentNames}
            sequenceType={sequenceType}
            setType={setType}
        />
        <AlignmentSequenceTabs
            nucleotideSegmentNames={nucleotideSegmentNames}
            sequenceType={sequenceType}
            setType={setType}
        />
        {genes.map((gene) => (
            <Tab
                isActive={isGeneSequence(gene, sequenceType)}
                onClick={() => setType(geneSequence(gene))}
                label={gene}
            />
        ))}
    </div>
);

const UnalignedNucleotideSequenceTabs: FC<NucleotideSequenceTabsProps> = ({
    nucleotideSegmentNames,
    sequenceType,
    setType,
}) => {
    if (!isMultiSegmented(nucleotideSegmentNames)) {
        const onlySegment = nucleotideSegmentNames[0];
        return (
            <Tab
                key={onlySegment}
                isActive={isUnalignedSequence(sequenceType)}
                onClick={() => setType(unalignedSequenceSegment(onlySegment))}
                label='Sequence'
            />
        );
    }

    return (
        <>
            {nucleotideSegmentNames.map((segmentName) => (
                <Tab
                    key={segmentName}
                    isActive={isUnalignedSequence(sequenceType)}
                    onClick={() => setType(unalignedSequenceSegment(segmentName))}
                    label={`${segmentName} (unaligned)`}
                />
            ))}
        </>
    );
};

const AlignmentSequenceTabs: FC<NucleotideSequenceTabsProps> = ({ nucleotideSegmentNames, sequenceType, setType }) => {
    if (!isMultiSegmented(nucleotideSegmentNames)) {
        const onlySegment = nucleotideSegmentNames[0];
        return (
            <Tab
                key={onlySegment}
                isActive={isAlignedSequence(sequenceType)}
                onClick={() => setType(alignedSequenceSegment(onlySegment))}
                label='Aligned'
            />
        );
    }

    return (
        <>
            {nucleotideSegmentNames.map((segmentName) => (
                <Tab
                    key={segmentName}
                    isActive={isAlignedSequence(sequenceType)}
                    onClick={() => setType(alignedSequenceSegment(segmentName))}
                    label={`${segmentName} (aligned)`}
                />
            ))}
        </>
    );
};

type TabProps = {
    isActive: boolean;
    label: string;
    onClick: () => void;
};

const Tab: FC<TabProps> = ({ isActive, label, onClick }) => (
    <button className={`tab ${isActive ? 'tab-active' : ''}`} onClick={onClick}>
        {label}
    </button>
);

function isMultiSegmented(nucleotideSegmentNames: string[]) {
    return nucleotideSegmentNames.length > 1;
}
