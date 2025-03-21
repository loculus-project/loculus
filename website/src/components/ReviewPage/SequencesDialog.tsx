import { type FC, useState } from 'react';

import { type SequenceEntryToEdit } from '../../types/backend.ts';
import { BoxWithTabsBox, BoxWithTabsTab, BoxWithTabsTabBar } from '../common/BoxWithTabs.tsx';
import { FixedLengthTextViewer } from '../common/FixedLengthTextViewer.tsx';

type SequencesDialogProps = {
    isOpen: boolean;
    onClose: () => void;
    dataToView: SequenceEntryToEdit | undefined;
};

type ProcessedSequence = {
    label: string;
    sequence: string | null;
};

export const SequencesDialog: FC<SequencesDialogProps> = ({ isOpen, onClose, dataToView }) => {
    const [activeTab, setActiveTab] = useState(0);

    if (!isOpen || !dataToView) return null;

    const processedSequences = extractProcessedSequences(dataToView);

    if (processedSequences.length === 0) {
        return null;
    }

    return (
        <div className='fixed inset-0 flex items-center justify-center z-50 overflow-auto bg-black bg-opacity-30'>
            <div className='bg-white rounded-lg p-6 max-w-6xl mx-3 w-full max-h-[90vh] flex flex-col'>
                <div className='flex justify-between items-center mb-4'>
                    <h2 className='text-xl font-semibold'>Processed Sequences</h2>
                    <button className='text-gray-500 hover:text-gray-700' onClick={onClose}>
                        ✕
                    </button>
                </div>

                <div className='flex-grow overflow-hidden flex flex-col'>
                    <BoxWithTabsTabBar>
                        {processedSequences.map(({ label }, i) => (
                            <BoxWithTabsTab
                                key={label}
                                isActive={i === activeTab}
                                label={label}
                                onClick={() => setActiveTab(i)}
                            />
                        ))}
                    </BoxWithTabsTabBar>
                    <BoxWithTabsBox>
                        {processedSequences[activeTab].sequence !== null && (
                            <div className='overflow-auto' style={{ maxHeight: 'calc(80vh - 10rem)' }}>
                                <FixedLengthTextViewer
                                    text={processedSequences[activeTab].sequence}
                                    maxLineLength={100}
                                />
                            </div>
                        )}
                    </BoxWithTabsBox>
                </div>
            </div>
        </div>
    );
};

const extractProcessedSequences = (data: SequenceEntryToEdit): ProcessedSequence[] => {
    return [
        { type: 'unaligned', sequences: data.processedData.unalignedNucleotideSequences },
        { type: 'aligned', sequences: data.processedData.alignedNucleotideSequences },
        { type: 'gene', sequences: data.processedData.alignedAminoAcidSequences },
    ].flatMap(({ type, sequences }) =>
        Object.entries(sequences).map(([sequenceName, sequence]) => {
            let label = sequenceName;
            if (type !== 'gene') {
                if (label === 'main') {
                    label = type === 'unaligned' ? 'Sequence' : 'Aligned';
                } else {
                    label = type === 'unaligned' ? `${sequenceName} (unaligned)` : `${sequenceName} (aligned)`;
                }
            }
            return { label, sequence };
        }),
    );
};
