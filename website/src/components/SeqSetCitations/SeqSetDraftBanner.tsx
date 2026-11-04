import { type FC, useEffect, useState } from 'react';
import { toast } from 'react-toastify';

import {
    removeSeqSetDraft,
    MAX_SEQ_SET_DRAFT_ENTRIES,
    getSeqSetDraft,
    type SeqSetDraft,
    updateSeqSetDraft,
    saveSeqSetDraft,
} from './seqSetDraft';
import { routes } from '../../routes/routes';
import { fetchDetailsFromLapis } from '../../services/lapisClientSideApi';
import { ACCESSION_VERSION_FIELD } from '../../settings';
import { formatNumberWithDefaultLocale } from '../../utils/formatNumber';
import { displayConfirmationDialog } from '../ConfirmationDialog';
import { type SequenceFilter } from '../SearchPage/DownloadDialog/SequenceFilters';
import { Button } from '../common/Button';
import MaterialSymbolsClose from '~icons/material-symbols/close';

const MAX_SEQSET_DRAFT_MESSAGE = `A SeqSet draft is limited to ${formatNumberWithDefaultLocale(MAX_SEQ_SET_DRAFT_ENTRIES)} entries. Please select fewer or remove existing entries.`;

type SeqSetDraftBannerProps = {
    lapisUrl?: string;
    sequenceFilter?: SequenceFilter;
    sequenceCount?: number;
};

type SeqSetDraftAddButtonProps = {
    draft: SeqSetDraft;
    sequenceFilter?: SequenceFilter;
    sequenceCount?: number;
    isFocal: boolean;
    handleAdd: () => Promise<void>;
};

const SeqSetDraftAddButton: FC<SeqSetDraftAddButtonProps> = ({
    draft,
    sequenceFilter,
    sequenceCount,
    isFocal,
    handleAdd,
}) => {
    const isSelection = sequenceFilter?.sequenceCount() !== undefined;
    const formattedCount = sequenceCount !== undefined ? formatNumberWithDefaultLocale(sequenceCount) : '...';
    const exceedsLimit =
        sequenceCount !== undefined && draft.accessions.length + sequenceCount > MAX_SEQ_SET_DRAFT_ENTRIES;

    return (
        <div className='group relative inline-block'>
            <Button
                size='sm'
                variant='primary'
                className='flex items-center gap-1'
                onClick={() => void handleAdd()}
                disabled={exceedsLimit}
            >
                {`Add ${isSelection ? formattedCount + ' selected' : 'all ' + formattedCount} to ${isFocal ? 'focal' : 'background'}`}
            </Button>
            {exceedsLimit && (
                <div className='invisible group-hover:visible absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 text-sm text-white bg-gray-800 rounded-md shadow-lg whitespace-nowrap z-20'>
                    {MAX_SEQSET_DRAFT_MESSAGE}
                    <div className='absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-gray-800' />
                </div>
            )}
        </div>
    );
};

export const SeqSetDraftBanner: FC<SeqSetDraftBannerProps> = ({ lapisUrl, sequenceFilter, sequenceCount }) => {
    const [draft, setDraft] = useState<SeqSetDraft | null>(null);

    useEffect(() => {
        setDraft(getSeqSetDraft());
    }, []);

    if (draft === null) return null;

    const focalCount = draft.accessions.filter((record) => record.isFocal).length;
    const backgroundCount = draft.accessions.length - focalCount;

    const applyAdd = (accessions: string[], isFocal: boolean) => {
        const updatedDraft = updateSeqSetDraft(draft, accessions, isFocal);
        saveSeqSetDraft(updatedDraft);
        setDraft(updatedDraft);
        toast.success(
            `Added ${formatNumberWithDefaultLocale(accessions.length)} sequences to ${isFocal ? 'focal' : 'background'} set.`,
            { position: 'top-right', autoClose: 2000 },
        );
    };

    const handleAdd = async (isFocal: boolean) => {
        if (lapisUrl === undefined || sequenceFilter === undefined) {
            return;
        }
        try {
            const response = await fetchDetailsFromLapis(lapisUrl, {
                ...sequenceFilter.toApiParams(),
                fields: [ACCESSION_VERSION_FIELD],
                limit: MAX_SEQ_SET_DRAFT_ENTRIES,
            });
            const accessions = response.data.map((item) => String(item[ACCESSION_VERSION_FIELD]));
            if (draft.accessions.length + accessions.length > MAX_SEQ_SET_DRAFT_ENTRIES) {
                toast.error(MAX_SEQSET_DRAFT_MESSAGE, { position: 'top-right' });
                return;
            }

            const accessionsInOtherSet = new Set(
                draft.accessions.filter((record) => record.isFocal !== isFocal).map((record) => record.accession),
            );
            const movingCount = accessions.filter((accession) => accessionsInOtherSet.has(accession)).length;
            if (movingCount === 0) {
                applyAdd(accessions, isFocal);
                return;
            }
            const fromSet = isFocal ? 'background' : 'focal';
            const toSet = isFocal ? 'focal' : 'background';
            displayConfirmationDialog({
                dialogText: `${formatNumberWithDefaultLocale(movingCount)} of these sequences are already in the ${fromSet} set. This will move them to the ${toSet} set. Are you sure you want to proceed?`,
                confirmButtonText: 'Proceed',
                onConfirmation: () => applyAdd(accessions, isFocal),
            });
        } catch {
            toast.error('Failed to add sequences to SeqSet draft.', { position: 'top-right' });
        }
    };

    const handleCancelDraft = () => {
        removeSeqSetDraft();
        setDraft(null);
    };

    return (
        <div className='relative bg-primary-50 border border-primary-200 rounded-sm p-4 mb-4 text-gray-800'>
            <Button
                onClick={handleCancelDraft}
                className='absolute top-2 right-3 text-gray-500 hover:text-gray-800'
                aria-label='Cancel draft'
            >
                <MaterialSymbolsClose className='w-5 h-5' />
            </Button>
            <p className='font-medium'>You have started drafting a SeqSet.</p>
            <p className='text-sm mt-1'>
                Focal sequences: {formatNumberWithDefaultLocale(focalCount)} · Background sequences:{' '}
                {formatNumberWithDefaultLocale(backgroundCount)}
            </p>
            <div className='flex flex-wrap gap-2 mt-3'>
                {sequenceFilter !== undefined &&
                    [true, false].map((isFocal) => (
                        <SeqSetDraftAddButton
                            key={isFocal ? 'focal' : 'background'}
                            draft={draft}
                            sequenceFilter={sequenceFilter}
                            sequenceCount={sequenceCount}
                            isFocal={isFocal}
                            handleAdd={() => handleAdd(isFocal)}
                        />
                    ))}
                <Button size='sm' variant='primary' className='flex items-center gap-1' onClick={handleCancelDraft}>
                    Cancel draft
                </Button>
                <Button
                    size='sm'
                    variant='primary'
                    className='flex items-center gap-1'
                    onClick={() => {
                        const isDraft = true;
                        location.href = routes.seqSetsPage(isDraft);
                    }}
                >
                    Review & create
                </Button>
            </div>
        </div>
    );
};
