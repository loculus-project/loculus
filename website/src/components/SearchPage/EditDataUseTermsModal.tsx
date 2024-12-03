import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';

import { BaseDialog } from './BaseDialog';
import { backendClientHooks, lapisClientHooks } from '../../services/serviceHooks';
import { DATA_USE_TERMS_FIELD, DATA_USE_TERMS_RESTRICTED_UNTIL_FIELD } from '../../settings';
import { ActiveDownloadFilters } from './DownloadDialog/ActiveDownloadFilters';
import type { SequenceFilter } from './DownloadDialog/SequenceFilters';
import { openDataUseTermsType, restrictedDataUseTermsType, type DataUseTermsType } from '../../types/backend';
import type { ClientConfig } from '../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { stringifyMaybeAxiosError } from '../../utils/stringifyMaybeAxiosError';

interface EditDataUseTermsModalProps {
    lapisUrl: string;
    clientConfig: ClientConfig;
    accessToken?: string;
    sequenceFilter: SequenceFilter;
}

type LoadingState = {
    type: 'loading';
};

type ErrorState = {
    type: 'error';
    error: any; // TODO
};

type ResultType = 'allOpen' | 'mixed' | 'allRestricted';

type LoadedState = {
    type: 'loaded';
    resultType: ResultType;
    totalCount: number;
    openCount: number;
    restrictedCount: number;
    openAccessions: string[];
    restrictedAccessions: string[];
    earliestRestrictedUntil: Date | null;
};

function getLoadedState(rows: Record<string, any>[]): LoadedState {
    const openAccessions: string[] = [];
    const restrictedAccessions: string[] = [];
    let earliestRestrictedUntil: Date | null = null;

    rows.forEach((row) => {
        switch (row[DATA_USE_TERMS_FIELD] as DataUseTermsType) {
            case openDataUseTermsType:
                openAccessions.push(row.accession);
                break;
            case restrictedDataUseTermsType:
                restrictedAccessions.push(row.accession);
                const date = new Date(row[DATA_USE_TERMS_RESTRICTED_UNTIL_FIELD]);
                if (earliestRestrictedUntil === null || date < earliestRestrictedUntil) {
                    earliestRestrictedUntil = date;
                }
                break;
        }
    });

    const totalCount = rows.length;
    const openCount = openAccessions.length;
    const restrictedCount = totalCount - openCount;
    const resultType: ResultType =
        openCount === totalCount ? 'allOpen' : restrictedCount === totalCount ? 'allRestricted' : 'mixed';

    return {
        type: 'loaded',
        resultType,
        totalCount,
        openCount,
        restrictedCount,
        openAccessions,
        restrictedAccessions,
        earliestRestrictedUntil,
    };
}

type DataState = LoadingState | ErrorState | LoadedState;

export const EditDataUseTermsModal: React.FC<EditDataUseTermsModalProps> = ({
    lapisUrl,
    clientConfig,
    accessToken,
    sequenceFilter,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const openDialog = () => setIsOpen(true);
    const closeDialog = () => setIsOpen(false);

    const detailsHook = lapisClientHooks(lapisUrl).zodiosHooks.useDetails({}, {});

    useEffect(() => {
        detailsHook.mutate({
            ...sequenceFilter.toApiParams(),
            fields: ['accession', DATA_USE_TERMS_FIELD, DATA_USE_TERMS_RESTRICTED_UNTIL_FIELD],
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sequenceFilter]);

    const [state, setState] = useState<DataState>({ type: 'loading' });

    useEffect(() => {
        if (detailsHook.isLoading) {
            return;
        }
        if (detailsHook.error !== null && state.type !== 'error') {
            setState({ type: 'error', error: detailsHook.error });
            return;
        }
        if (detailsHook.data) {
            const newState = getLoadedState(detailsHook.data.data);
            setState(newState);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [detailsHook.data, detailsHook.error, detailsHook.isLoading]);

    return (
        <>
            <button className='mr-4 underline text-primary-700 hover:text-primary-500' onClick={openDialog}>
                Edit data use terms
            </button>
            <BaseDialog title='Edit data use terms' isOpen={isOpen} onClose={closeDialog}>
                <ActiveDownloadFilters downloadParameters={sequenceFilter} />
                {state.type === 'loading' && 'loading'}
                {state.type === 'error' && `error: ${state.error}`}
                {state.type === 'loaded' && (
                    <EditControl
                        clientConfig={clientConfig}
                        accessToken={accessToken}
                        state={state}
                        closeDialog={closeDialog}
                    />
                )}
            </BaseDialog>
        </>
    );
};

interface EditControlProps {
    clientConfig: ClientConfig;
    accessToken?: string;
    state: LoadedState;
    closeDialog: () => void;
}

const EditControl: React.FC<EditControlProps> = ({ clientConfig, accessToken, state, closeDialog }) => {
    const setDataUseTermsHook = backendClientHooks(clientConfig).useSetDataUseTerms(
        { headers: createAuthorizationHeader(accessToken!) }, // TODO accessToken might be null
        {
            onError: (error) =>
                toast.error('Failed to edit terms of use: ' + stringifyMaybeAxiosError(error), {
                    position: 'top-center',
                    autoClose: false,
                }),
            onSuccess: () => location.reload(),
        },
    );

    const releaseButton = (
        <button
            className='btn loculusColor text-white'
            onClick={() => {
                closeDialog();
                setDataUseTermsHook.mutate({
                    accessions: state.restrictedAccessions,
                    newDataUseTerms: {
                        type: openDataUseTermsType,
                    },
                });
            }}
        >
            Release {state.restrictedCount} restricted sequences
        </button>
    );

    switch (state.resultType) {
        case 'allOpen':
            return <p>All selected sequences are already open, nothing to edit.</p>;
        case 'mixed':
            return (
                <>
                    <p>
                        {state.openCount} open and {state.restrictedCount} restricted sequences selected. You can
                        release all the {state.restrictedCount} restricted sequences as open. If you want to pick a date
                        for the restricted sequences, please narrow your selection down to just restricted sequences.
                        You can use the filters to do so.
                    </p>
                    {releaseButton}
                </>
            );
        case 'allRestricted':
            return (
                <>
                    <p>
                        {state.restrictedCount} restricted sequences selected. The earliest date is{' '}
                        {String(state.earliestRestrictedUntil)}. You can update all sequences with a date from now until
                        that date.
                    </p>
                    {releaseButton}
                    <p className='italic'>TODO add calendar here to select date</p>
                </>
            );
    }
};
