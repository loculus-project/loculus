import { useEffect, useState } from 'react';

import { BaseDialog } from './BaseDialog';
import { lapisClientHooks } from '../../services/serviceHooks';
import { DATA_USE_TERMS_FIELD, DATA_USE_TERMS_RESTRICTED_UNTIL_FIELD } from '../../settings';
import type { SequenceFilter } from './DownloadDialog/SequenceFilters';

interface EditDataUseTermsModalProps {
    lapisUrl: string;
    sequenceFilter: SequenceFilter;
}

type LoadingState = {
    type: 'loading'
}

type ErrorState = {
    type: 'error',
    error: any // TODO
}

type LoadedState = {
    type: 'loaded',
    unrestrictedAccessions: string[],
    earliestRestrictedUntil: Date | null
}

function getLoadedState(rows: Record<string, any>[]): LoadedState {
    const unrestrictedAccessions: string[] = [];
    var earliestRestrictedUntil: Date | null = null;

    rows.forEach((row) => {
        if (row[DATA_USE_TERMS_FIELD] !== 'RESTRICTED') { // TODO maybe don't hardcode this here?
            unrestrictedAccessions.push(row.accession);
        } else {
            const date = new Date(row[DATA_USE_TERMS_RESTRICTED_UNTIL_FIELD]);
            if (earliestRestrictedUntil === null || date < earliestRestrictedUntil) {
                earliestRestrictedUntil = date;
            }
        }
    });

    return {
        type: 'loaded',
        unrestrictedAccessions,
        earliestRestrictedUntil
    }
}

type DataState = LoadingState | ErrorState | LoadedState;


export const EditDataUseTermsModal: React.FC<EditDataUseTermsModalProps> = ({ lapisUrl, sequenceFilter }) => {
    const [isOpen, setIsOpen] = useState(false);
    const openDialog = () => setIsOpen(true);
    const closeDialog = () => setIsOpen(false);

    const hooks = lapisClientHooks(lapisUrl).zodiosHooks;
    const detailsHook = hooks.useDetails({}, {});

    useEffect(() => {
        detailsHook.mutate({
            ...sequenceFilter.toApiParams(),
            fields: ['accession', DATA_USE_TERMS_FIELD, DATA_USE_TERMS_RESTRICTED_UNTIL_FIELD],
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sequenceFilter]);

    const [state, setState] = useState<DataState>({type: 'loading'});

    useEffect(() => {
        if (detailsHook.isLoading) {
            return;
        }
        if (detailsHook.isError && state.type !== 'error') {
            setState({type: 'error', error: detailsHook.error});
            return;
        } 
        if (detailsHook.isSuccess) {
            const newState = getLoadedState(detailsHook.data.data);
            setState(newState);
        }
    }, [detailsHook.data?.data, detailsHook.isError, detailsHook.isLoading]);

    // TODO
    // - Display which sequences will be edited. maybe reuse ActiveDownloadFilters?
    // - calculate the range of possible dates. I.e. from now until earliest date.
    // - think about what to do when we actually update.

    // stretch goals:
    // - maybe also show if sequences from multiple groups are selected? That might be unintentional?

    return (
        <>
            <button className='mr-4 underline text-primary-700 hover:text-primary-500' onClick={openDialog}>
                Edit data use terms
            </button>
            <BaseDialog title='Edit data use terms' isOpen={isOpen} onClose={closeDialog}>
                {state.type === 'loading' && 'loading'}
                {state.type === 'error' && `error: ${state.error}`}
                {state.type === 'loaded' &&(
                    <p>
                        {`Found ${state.unrestrictedAccessions.length} unrestricted sequences in the selection.`}
                    </p>
                )}
            </BaseDialog>
        </>
    );
};

// Which cases are there?
// - All sequence open
//   -> Nothing to do
// - There are _some_ open sequences, some restricted
//   -> show how many there are of each, and give option to release restricted sequences
// - All sequences are restricted
//   -> show how many, and give calendar to pick date

