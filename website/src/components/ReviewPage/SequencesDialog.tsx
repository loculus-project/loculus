import { type FC, useState } from 'react';

import { type SequenceEntryToEdit } from '../../types/backend.ts';
import { BaseDialog } from '../common/BaseDialog.tsx';
import { BoxWithTabsBox, BoxWithTabsTab, BoxWithTabsTabBar } from '../common/BoxWithTabs.tsx';
import { FixedLengthTextViewer } from '../common/FixedLengthTextViewer.tsx';

type SequencesDialogProps = {
    isOpen: boolean;
    onClose: () => void;
    dataToView: SequenceEntryToEdit | undefined;
    segmentAndGeneDisplayNameMap: Map<string, string | null>;
};

type ProcessedSequence = {
    label: string;
    sequence: string;
};

export const SequencesDialog: FC<SequencesDialogProps> = ({
    isOpen,
    onClose,
    dataToView,
    segmentAndGeneDisplayNameMap,
}) => {
    const [activeTab, setActiveTab] = useState(0);

    if (!dataToView) return null;

    const processedSequences = extractProcessedSequences(dataToView, segmentAndGeneDisplayNameMap);

    if (processedSequences.length === 0) {
        return null;
    }

    return (
        <BaseDialog title='Processed sequences' isOpen={isOpen} onClose={onClose}>
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
                    <div className='overflow-auto' style={{ maxHeight: 'calc(80vh - 10rem)' }}>
                        <FixedLengthTextViewer text={processedSequences[activeTab].sequence} maxLineLength={100} />
                    </div>
                </BoxWithTabsBox>
            </div>
        </BaseDialog>
    );
};

const extractProcessedSequences = (
    data: SequenceEntryToEdit,
    segmentAndGeneDisplayNameMap: Map<string, string | null>,
): ProcessedSequence[] => {
    return [
        { type: 'unaligned', sequences: data.processedData.unalignedNucleotideSequences },
        { type: 'aligned', sequences: data.processedData.alignedNucleotideSequences },
        { type: 'gene', sequences: data.processedData.alignedAminoAcidSequences },
    ].flatMap(({ type, sequences }) =>
        Object.entries(sequences)
            .filter((tuple): tuple is [string, string] => tuple[1] !== null)
            .map(([sequenceName, sequence]) => {
                let label = segmentAndGeneDisplayNameMap.get(sequenceName) ?? sequenceName;
                if (type !== 'gene') {
                    if (label === 'main') {
                        label = type === 'unaligned' ? 'Sequence' : 'Aligned';
                    } else {
                        label = type === 'unaligned' ? `${label} (unaligned)` : `${label} (aligned)`;
                    }
                }
                return { label, sequence };
            }),
    );
};
