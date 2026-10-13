import { type FC, useEffect, useState } from 'react';
import { toast } from 'react-toastify';

import {
    addToSeqSetDraft,
    clearSeqSetDraft,
    MAX_SEQ_SET_DRAFT_ENTRIES,
    readSeqSetDraft,
    type SeqSetDraft,
    writeSeqSetDraft,
} from './seqSetDraft';
import { routes } from '../../routes/routes';
import { fetchDetailsFromLapis } from '../../services/lapisClientSideApi';
import { ACCESSION_VERSION_FIELD } from '../../settings';
import { formatNumberWithDefaultLocale } from '../../utils/formatNumber';
import { displayConfirmationDialog } from '../ConfirmationDialog';
import { type SequenceFilter } from '../SearchPage/DownloadDialog/SequenceFilters';
import { Button } from '../common/Button';
import MaterialSymbolsClose from '~icons/material-symbols/close';

type SeqSetDraftBannerProps = {
    lapisUrl?: string;
    sequenceFilter?: SequenceFilter;
    sequenceCount?: number;
    clearSelection?: () => void;
};

export const SeqSetDraftBanner: FC<SeqSetDraftBannerProps> = ({
    lapisUrl,
    sequenceFilter,
    sequenceCount,
    clearSelection,
}) => {
    const [draft, setDraft] = useState<SeqSetDraft | null>(null);
    const [isAdding, setIsAdding] = useState(false);

    useEffect(() => {
        setDraft(readSeqSetDraft());
    }, []);

    if (draft === null) {
        return null;
    }

    const focalCount = draft.accessions.filter((record) => record.isFocal).length;
    const backgroundCount = draft.accessions.length - focalCount;

    const isSelection = sequenceFilter?.sequenceCount() !== undefined;
    const exceedsLimit =
        sequenceCount !== undefined && draft.accessions.length + sequenceCount > MAX_SEQ_SET_DRAFT_ENTRIES;
    const formattedCount = sequenceCount !== undefined ? formatNumberWithDefaultLocale(sequenceCount) : '...';
    const addLabel = isSelection ? `Add ${formattedCount} selected` : `Add all ${formattedCount}`;

    const applyAdd = (accessions: string[], isFocal: boolean) => {
        const updatedDraft = addToSeqSetDraft(draft, accessions, isFocal);
        writeSeqSetDraft(updatedDraft);
        setDraft(updatedDraft);
        clearSelection?.();
        toast.success(
            `Added ${formatNumberWithDefaultLocale(accessions.length)} sequences to ${isFocal ? 'focal' : 'background'}`,
            { position: 'bottom-center', autoClose: 2000 },
        );
    };

    const handleAdd = async (isFocal: boolean) => {
        if (isAdding || lapisUrl === undefined || sequenceFilter === undefined) {
            return;
        }
        setIsAdding(true);
        try {
            const response = await fetchDetailsFromLapis(lapisUrl, {
                ...sequenceFilter.toApiParams(),
                fields: [ACCESSION_VERSION_FIELD],
                limit: MAX_SEQ_SET_DRAFT_ENTRIES,
            });
            const accessions = response.data.map((item) => String(item[ACCESSION_VERSION_FIELD]));
            if (draft.accessions.length + accessions.length > MAX_SEQ_SET_DRAFT_ENTRIES) {
                toast.error(
                    `A SeqSet can contain at most ${formatNumberWithDefaultLocale(MAX_SEQ_SET_DRAFT_ENTRIES)} sequences`,
                    { position: 'bottom-center' },
                );
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
            toast.error('Failed to add sequences to the SeqSet draft', { position: 'bottom-center' });
        } finally {
            setIsAdding(false);
        }
    };

    const handleCancelDraft = () => {
        clearSeqSetDraft();
        setDraft(null);
    };

    const renderAddButton = (isFocal: boolean) => (
        <div className='group relative inline-block'>
            <Button
                size='sm'
                variant='primary'
                className='flex items-center gap-1'
                onClick={() => void handleAdd(isFocal)}
                disabled={exceedsLimit}
            >
                {`${addLabel} to ${isFocal ? 'focal' : 'background'}`}
            </Button>
            {exceedsLimit && (
                <div className='invisible group-hover:visible absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 text-sm text-white bg-gray-800 rounded-md shadow-lg whitespace-nowrap z-20'>
                    A SeqSet can contain at most {formatNumberWithDefaultLocale(MAX_SEQ_SET_DRAFT_ENTRIES)} sequences
                    <div className='absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-gray-800' />
                </div>
            )}
        </div>
    );

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
                {sequenceFilter !== undefined && (
                    <>
                        {renderAddButton(true)}
                        {renderAddButton(false)}
                    </>
                )}
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
