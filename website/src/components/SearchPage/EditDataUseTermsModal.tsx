import { useEffect, useState } from 'react';

import { BaseDialog } from './BaseDialog';
import { lapisClientHooks } from '../../services/serviceHooks';
import { DATA_USE_TERMS_FIELD, DATA_USE_TERMS_RESTRICTED_UNTIL_FIELD } from '../../settings';
import type { SequenceFilter } from './DownloadDialog/SequenceFilters';
import { ActiveDownloadFilters } from './DownloadDialog/ActiveDownloadFilters';

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

type ResultType = 'allOpen' | 'mixed' | 'allRestricted';

type LoadedState = {
    type: 'loaded',
    resultType: ResultType,
    totalCount: number,
    openCount: number,
    restrictedCount: number,
    openAccessions: string[],
    earliestRestrictedUntil: Date | null
}

function getLoadedState(rows: Record<string, any>[]): LoadedState {
    const openAccessions: string[] = [];
    var earliestRestrictedUntil: Date | null = null;

    rows.forEach((row) => {
        if (row[DATA_USE_TERMS_FIELD] !== 'RESTRICTED') { // TODO maybe don't hardcode this here?
            openAccessions.push(row.accession);
        } else {
            const date = new Date(row[DATA_USE_TERMS_RESTRICTED_UNTIL_FIELD]);
            if (earliestRestrictedUntil === null || date < earliestRestrictedUntil) {
                earliestRestrictedUntil = date;
            }
        }
    });

    const totalCount = rows.length;
    const openCount = openAccessions.length;
    const restrictedCount = totalCount - openCount;
    var resultType: ResultType = openCount == totalCount ? 'allOpen' : (restrictedCount === totalCount ? 'allRestricted' : 'mixed');

    return {
        type: 'loaded',
        resultType,
        totalCount,
        openCount,
        restrictedCount,
        openAccessions,
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

    return (
        <>
            <button className='mr-4 underline text-primary-700 hover:text-primary-500' onClick={openDialog}>
                Edit data use terms
            </button>
            <BaseDialog title='Edit data use terms' isOpen={isOpen} onClose={closeDialog}>
                <ActiveDownloadFilters downloadParameters={sequenceFilter} />
                {state.type === 'loading' && 'loading'}
                {state.type === 'error' && `error: ${state.error}`}
                {state.type === 'loaded' && (<EditControl state={state} />) }
            </BaseDialog>
        </>
    );
};

interface EditControlProps {
    state: LoadedState
}

const EditControl: React.FC<EditControlProps> = ({
    state
}) => {
    switch (state.resultType) {
        case 'allOpen':
            return (
                <p>
                    All selected sequences are already open, nothing to edit.
                </p>
            );
        case 'mixed':
            return (
                <>
                    <p>
                        {state.openCount} open and {state.restrictedCount} restricted sequences selected.
                        You can release all the {state.restrictedCount} restricted sequences as open.
                        If you want to pick a date for the restricted sequences, please narrow your selection down to 
                        just restricted sequences. You can use the filters to do so.
                    </p>
                    <p className='italic'>
                        TODO: Add the button to release here
                    </p>
                </>
            );
        case 'allRestricted':
            return (
                <>
                    <p>
                        {state.restrictedCount} restricted sequences selected.
                        The earliest date is {String(state.earliestRestrictedUntil)}.
                        You can update all sequences with a date from now until that date.
                    </p>
                    <p className='italic'>
                        TODO add calendar here to select date, or button to release them all.
                    </p>
                </>
            );
    }
}
