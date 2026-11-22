import { type FC, useState } from 'react';

import { type SequenceEntryToEdit } from '../../types/backend.ts';
import type { ReferenceGenomesInfo } from '../../types/referencesGenomes.ts';
import { lapisNameToDisplayName } from '../../utils/sequenceTypeHelpers.ts';
import { BoxWithTabsBox, BoxWithTabsTab, BoxWithTabsTabBar } from '../common/BoxWithTabs.tsx';
import { Button } from '../common/Button';
import { FixedLengthTextViewer } from '../common/FixedLengthTextViewer.tsx';
import { Spinner } from '../common/Spinner';

type SequencesDialogProps = {
    isOpen: boolean;
    onClose: () => void;
    dataToView: SequenceEntryToEdit | undefined;
    referenceGenomesInfo: ReferenceGenomesInfo;
    isLoading?: boolean;
    isError?: boolean;
    onRetry?: () => void;
};

type ProcessedSequence = {
    label: string;
    sequence: string;
};

export const SequencesDialog: FC<SequencesDialogProps> = ({
    isOpen,
    onClose,
    dataToView,
    referenceGenomesInfo,
    isLoading = false,
    isError = false,
    onRetry,
}) => {
    const [activeTab, setActiveTab] = useState(0);

    if (!isOpen) return null;

    const processedSequences = dataToView
        ? extractProcessedSequences(dataToView, lapisNameToDisplayName(referenceGenomesInfo))
        : [];
    const selectedTab = Math.min(activeTab, Math.max(0, processedSequences.length - 1));

    return (
        <div
            role='dialog'
            aria-modal='true'
            aria-label='Processed sequences'
            className='fixed inset-0 flex items-center justify-center z-50 overflow-auto bg-black/30'
        >
            <div className='bg-white rounded-lg p-6 max-w-6xl mx-3 w-full max-h-[90vh] flex flex-col'>
                <div className='flex justify-between items-center mb-4'>
                    <h2 className='text-xl font-semibold'>Processed sequences</h2>
                    <Button className='text-gray-500 hover:text-gray-700' onClick={onClose}>
                        ✕
                    </Button>
                </div>

                {isLoading ? (
                    <Spinner size='sm' label='Loading sequences' />
                ) : isError ? (
                    <p role='alert'>
                        Sequences could not be loaded.{' '}
                        <Button className='underline' onClick={onRetry}>
                            Retry
                        </Button>
                    </p>
                ) : processedSequences.length === 0 ? (
                    <p>No processed sequences are available.</p>
                ) : (
                    <div className='grow overflow-hidden flex flex-col'>
                        <BoxWithTabsTabBar>
                            {processedSequences.map(({ label }, i) => (
                                <BoxWithTabsTab
                                    key={label}
                                    isActive={i === selectedTab}
                                    label={label}
                                    onClick={() => setActiveTab(i)}
                                />
                            ))}
                        </BoxWithTabsTabBar>
                        <BoxWithTabsBox>
                            <div className='overflow-auto' style={{ maxHeight: 'calc(80vh - 10rem)' }}>
                                <FixedLengthTextViewer
                                    text={processedSequences[selectedTab].sequence}
                                    maxLineLength={100}
                                />
                            </div>
                        </BoxWithTabsBox>
                    </div>
                )}
            </div>
        </div>
    );
};

const extractProcessedSequences = (
    data: SequenceEntryToEdit,
    lapisNameToDisplayNameMap: Map<string, string | undefined>,
): ProcessedSequence[] => {
    return [
        { type: 'unaligned', sequences: data.processedData.unalignedNucleotideSequences },
        { type: 'aligned', sequences: data.processedData.alignedNucleotideSequences },
        { type: 'gene', sequences: data.processedData.alignedAminoAcidSequences },
    ].flatMap(({ type, sequences }) =>
        Object.entries(sequences)
            .filter((tuple): tuple is [string, string] => tuple[1] !== null)
            .map(([sequenceName, sequence]) => {
                let label = lapisNameToDisplayNameMap.get(sequenceName);
                if (type !== 'gene') {
                    if (label === undefined) {
                        label = type === 'unaligned' ? 'Sequence' : 'Reference-aligned';
                    } else {
                        label = type === 'unaligned' ? `${label} (unaligned)` : `${label} (reference-aligned)`;
                    }
                }
                return { label: label ?? sequenceName, sequence };
            }),
    );
};
