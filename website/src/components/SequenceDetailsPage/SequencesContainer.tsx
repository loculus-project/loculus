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
        <>
            <SequenceTabs
                nucleotideSegmentNames={nucleotideSegmentNames}
                sequenceType={sequenceType}
                setType={setSequenceType}
                genes={genes}
            />
            <BoxWithTabsBox>
                <SequencesViewer
                    organism={organism}
                    accessionVersion={accessionVersion}
                    clientConfig={clientConfig}
                    sequenceType={sequenceType}
                    isMultiSegmented={isMultiSegmented(nucleotideSegmentNames)}
                />
            </BoxWithTabsBox>
        </>
    );
};

export const SequencesContainer = withQueryProvider(InnerSequencesContainer);

type NucleotideSequenceTabsProps = {
    nucleotideSegmentNames: NucleotideSegmentNames;
    sequenceType: SequenceType;
    setType: Dispatch<SetStateAction<SequenceType>>;
};

const SequenceTabs: FC<NucleotideSequenceTabsProps & { genes: string[] }> = ({
    nucleotideSegmentNames,
    genes,
    sequenceType,
    setType,
}) => (
    <BoxWithTabsTabBar>
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
            <BoxWithTabsTab
                isActive={isGeneSequence(gene, sequenceType)}
                onClick={() => setType(geneSequence(gene))}
                label={gene}
                key={gene}
            />
        ))}
    </BoxWithTabsTabBar>
);

const UnalignedNucleotideSequenceTabs: FC<NucleotideSequenceTabsProps> = ({
    nucleotideSegmentNames,
    sequenceType,
    setType,
}) => {
    if (!isMultiSegmented(nucleotideSegmentNames)) {
        const onlySegment = nucleotideSegmentNames[0];
        return (
            <BoxWithTabsTab
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
                <BoxWithTabsTab
                    key={segmentName}
                    isActive={isUnalignedSequence(sequenceType) && segmentName === sequenceType.name}
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
            <BoxWithTabsTab
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
                <BoxWithTabsTab
                    key={segmentName}
                    isActive={isAlignedSequence(sequenceType)}
                    onClick={() => setType(alignedSequenceSegment(segmentName))}
                    label={`${segmentName} (aligned)`}
                />
            ))}
        </>
    );
};

function isMultiSegmented(nucleotideSegmentNames: string[]) {
    return nucleotideSegmentNames.length > 1;
}
