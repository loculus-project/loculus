import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';

import DataUseTermsSelector from './DataUseTermsSelector';
import { routes } from '../../routes/routes';
import { backendClientHooks, lapisClientHooks } from '../../services/serviceHooks';
import { DATA_USE_TERMS_FIELD, DATA_USE_TERMS_RESTRICTED_UNTIL_FIELD } from '../../settings';
import {
    openDataUseTermsType,
    restrictedDataUseTermsType,
    type DataUseTerms,
    type DataUseTermsType,
} from '../../types/backend';
import type { ClientConfig } from '../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { stringifyMaybeAxiosError } from '../../utils/stringifyMaybeAxiosError';
import type { SequenceFilter } from '../SearchPage/DownloadDialog/SequenceFilters';
import { ActiveFilters } from '../common/ActiveFilters';
import { BaseDialog } from '../common/BaseDialog';

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
    error: any; // not too happy about the 'any' here, but I think it's fine
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
    earliestRestrictedUntil: DateTime | null;
};

function getLoadedState(rows: Record<string, any>[]): LoadedState {
    const openAccessions: string[] = [];
    const restrictedAccessions: string[] = [];
    let earliestRestrictedUntil: DateTime | null = null;

    rows.forEach((row) => {
        switch (row[DATA_USE_TERMS_FIELD] as DataUseTermsType) {
            case openDataUseTermsType:
                openAccessions.push(row.accession);
                break;
            case restrictedDataUseTermsType:
                restrictedAccessions.push(row.accession);
                const date = DateTime.fromFormat(row[DATA_USE_TERMS_RESTRICTED_UNTIL_FIELD], 'yyyy-MM-dd');
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
                {state.type === 'loaded' &&
                    (accessToken === undefined ? (
                        <p>You need to be logged in to edit data use terms.</p>
                    ) : (
                        <EditControl
                            clientConfig={clientConfig}
                            accessToken={accessToken}
                            state={state}
                            closeDialog={closeDialog}
                            sequenceFilter={sequenceFilter}
                        />
                    ))}
            </BaseDialog>
        </>
    );
};

interface EditControlProps {
    clientConfig: ClientConfig;
    accessToken: string;
    state: LoadedState;
    sequenceFilter: SequenceFilter;
    closeDialog: () => void;
}

const EditControl: React.FC<EditControlProps> = ({ clientConfig, accessToken, state, closeDialog, sequenceFilter }) => {
    const [dataUseTerms, setDataUseTerms] = useState<DataUseTerms | null>(null);

    switch (state.resultType) {
        case 'allOpen':
            return (
                <>
                    <ActiveFilters sequenceFilter={sequenceFilter} />
                    <p>All selected sequences are already open, nothing to edit.</p>
                </>
            );
        case 'mixed':
            return (
                <div className='space-y-4'>
                    <ActiveFilters sequenceFilter={sequenceFilter} />
                    <p>
                        {state.openCount} open and {state.restrictedCount} restricted sequences selected.
                    </p>
                    <p>
                        You can release all the {state.restrictedCount} restricted sequences, moving them to the{' '}
                        <a href={routes.datauseTermsPage()} className='text-primary-600'>
                            Open Data Use Terms
                        </a>
                        . If you want to pick a date for the restricted sequences, please narrow your selection down to
                        just restricted sequences. You can use the filters to do so.
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
            const earliestDateDisplay = state.earliestRestrictedUntil!.toFormat('yyyy-MM-dd');
            return (
                <div className='space-y-4'>
                    <ActiveFilters sequenceFilter={sequenceFilter} />
                    <h4 className='font-bold mb-2'>
                        Choose the new data use terms for {state.restrictedCount} restricted sequence
                        {state.restrictedCount > 1 ? 's' : ''}
                    </h4>
                    <div className='flex flex-col md:flex-row'>
                        <DataUseTermsSelector
                            maxRestrictedUntil={state.earliestRestrictedUntil!}
                            setDataUseTerms={setDataUseTerms}
                        />
                    </div>
                    <p className='text-xs text-gray-500'>
                        The release date of a sequence cannot be updated to be later than the date that is currently
                        set. This means that the new release date can only be between now and the earliest release date
                        for any of the selected sequences, which is <b>{earliestDateDisplay}</b>.
                    </p>
                    <CancelSubmitButtons
                        clientConfig={clientConfig}
                        accessToken={accessToken}
                        newTerms={dataUseTerms}
                        affectedAccesions={state.restrictedAccessions}
                        closeDialog={closeDialog}
                    />
                </div>
            );
    }
};

interface CancelSubmitButtonProps {
    clientConfig: ClientConfig;
    accessToken: string;
    newTerms: DataUseTerms | null;
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
        { headers: createAuthorizationHeader(accessToken) },
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
    let buttonText = 'Update';
    if (newTerms) {
        switch (newTerms.type) {
            case restrictedDataUseTermsType:
                buttonText = `Update release date on ${affectedAccesions.length} sequence${maybeS}`;
                break;
            case openDataUseTermsType:
                buttonText = `Release ${affectedAccesions.length} sequence${maybeS} now`;
                break;
        }
    }

    return (
        <div className='flex flex-row gap-2 justify-end'>
            <button className='btn' onClick={closeDialog}>
                Cancel
            </button>
            <button
                className='btn loculusColor text-white'
                disabled={newTerms === null}
                onClick={() => {
                    closeDialog();
                    if (newTerms === null) return;
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
