import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';

import { BaseDialog } from './BaseDialog';
import { backendClientHooks, lapisClientHooks } from '../../services/serviceHooks';
import { DATA_USE_TERMS_FIELD, DATA_USE_TERMS_RESTRICTED_UNTIL_FIELD } from '../../settings';
import { ActiveDownloadFilters } from './DownloadDialog/ActiveDownloadFilters';
import type { SequenceFilter } from './DownloadDialog/SequenceFilters';
import {
    openDataUseTermsType,
    restrictedDataUseTermsType,
    type DataUseTerms,
    type DataUseTermsType,
} from '../../types/backend';
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
                {state.type === 'loading' && 'loading'}
                {state.type === 'error' && `error: ${state.error}`}
                {state.type === 'loaded' && (
                    <EditControl
                        clientConfig={clientConfig}
                        accessToken={accessToken}
                        state={state}
                        closeDialog={closeDialog}
                        sequenceFilter={sequenceFilter}
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
    sequenceFilter: SequenceFilter;
    closeDialog: () => void;
}

const EditControl: React.FC<EditControlProps> = ({ clientConfig, accessToken, state, closeDialog, sequenceFilter }) => {
    switch (state.resultType) {
        case 'allOpen':
            return (
                <>
                    <ActiveDownloadFilters downloadParameters={sequenceFilter} />
                    <p>All selected sequences are already open, nothing to edit.</p>
                </>
            );
        case 'mixed':
            return (
                <div className='space-y-4'>
                    <ActiveDownloadFilters downloadParameters={sequenceFilter} />
                    <p>
                        {state.openCount} open and {state.restrictedCount} restricted sequences selected.
                    </p>
                    <p>
                        You can release all the {state.restrictedCount} restricted sequences as open. If you want to
                        pick a date for the restricted sequences, please narrow your selection down to just restricted
                        sequences. You can use the filters to do so.
                    </p>
                    <CancelSubmitButtons
                        clientConfig={clientConfig}
                        accessToken={accessToken}
                        newTerms={{ type: openDataUseTermsType }}
                        affectedAccesions={state.restrictedAccessions}
                        closeDialog={closeDialog}
                    />
                </div>
            );
        case 'allRestricted':
            return (
                <div className='grid grid-cols-2 gap-4'>
                    <div>
                        <ActiveDownloadFilters downloadParameters={sequenceFilter} />
                        <p>
                            {state.restrictedCount} restricted sequences selected. The earliest date is{' '}
                            {String(state.earliestRestrictedUntil)}. You can update all sequences with a date from now
                            until that date.
                        </p>
                    </div>
                    <div className='flex flex-col justify-between'>
                        <div></div>
                        <CancelSubmitButtons
                            clientConfig={clientConfig}
                            accessToken={accessToken}
                            newTerms={{ type: openDataUseTermsType }} // TODO make it possible to set a date instead
                            affectedAccesions={state.restrictedAccessions}
                            closeDialog={closeDialog}
                        />
                    </div>
                </div>
            );
    }
};

interface CancelSubmitButtonProps {
    clientConfig: ClientConfig;
    accessToken?: string;
    newTerms: DataUseTerms;
    affectedAccesions: string[];
    closeDialog: () => void;
}

const CancelSubmitButtons: React.FC<CancelSubmitButtonProps> = ({
    clientConfig,
    accessToken,
    closeDialog,
    newTerms,
    affectedAccesions,
}) => {
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

    const maybeS = affectedAccesions.length > 1 ? 's' : '';
    let buttonText = '';
    switch (newTerms.type) {
        case restrictedDataUseTermsType:
            buttonText = `Update release date on ${affectedAccesions.length} sequence${maybeS}`;
            break;
        case openDataUseTermsType:
            buttonText = `Release ${affectedAccesions.length} sequence${maybeS}`;
            break;
    }

    return (
        <div className='flex flex-row gap-2 justify-end'>
            <button className='btn' onClick={closeDialog}>
                Cancel
            </button>
            <button
                className='btn loculusColor text-white'
                onClick={() => {
                    closeDialog();
                    setDataUseTermsHook.mutate({
                        accessions: affectedAccesions,
                        newDataUseTerms: newTerms,
                    });
                }}
            >
                {buttonText}
            </button>
        </div>
    );
};
