import { DateTime } from 'luxon';
import { useEffect, useState, type FC } from 'react';

import DataUseTermsSelector from './DataUseTermsSelector';
import { errorToast, successToast } from './EditDataUseTermsToasts';
import { routes } from '../../routes/routes';
import { backendClientHooks, lapisClientHooks } from '../../services/serviceHooks';
import { DATA_USE_TERMS_FIELD, DATA_USE_TERMS_RESTRICTED_UNTIL_FIELD } from '../../settings';
import {
    openDataUseTermsOption,
    restrictedDataUseTermsOption,
    type DataUseTerms,
    type DataUseTermsOption,
} from '../../types/backend';
import type { Details } from '../../types/lapis';
import type { ClientConfig } from '../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { formatNumberWithDefaultLocale } from '../../utils/formatNumber';
import type { SegmentAndGeneInfo } from '../../utils/sequenceTypeHelpers';
import type { SequenceFilter } from '../SearchPage/DownloadDialog/SequenceFilters';
import { ActiveFilters } from '../common/ActiveFilters';
import { BaseDialog } from '../common/BaseDialog';
import { Button } from '../common/Button';

interface EditDataUseTermsModalProps {
    lapisUrl: string;
    clientConfig: ClientConfig;
    accessToken?: string;
    sequenceFilter: SequenceFilter;
    segmentAndGeneInfo: SegmentAndGeneInfo;
}

type LoadingState = {
    type: 'loading';
};

type ErrorState = {
    type: 'error';
    error: unknown;
};

type ResultType = 'allOpen' | 'mixed' | 'allRestricted';

type LoadedState = {
    type: 'loaded';
    resultType: ResultType;
    totalCount: number;
    openCount: number;
    restrictedCount: number;
    openAccessions: string[];
    restrictedAccessions: Map<string, string>; // accession -> date
    earliestRestrictedUntil: DateTime | null;
};

function getLoadedState(rows: Details[]): LoadedState {
    const openAccessions: string[] = [];
    const restrictedAccessions = new Map<string, string>();
    let earliestRestrictedUntil: DateTime | null = null;

    rows.forEach((row) => {
        switch (row[DATA_USE_TERMS_FIELD] as DataUseTermsOption) {
            case openDataUseTermsOption:
                openAccessions.push(row.accession as string);
                break;
            case restrictedDataUseTermsOption: {
                const date = DateTime.fromFormat(row[DATA_USE_TERMS_RESTRICTED_UNTIL_FIELD] as string, 'yyyy-MM-dd');
                if (earliestRestrictedUntil === null || date < earliestRestrictedUntil) {
                    earliestRestrictedUntil = date;
                }
                restrictedAccessions.set(row.accession as string, row[DATA_USE_TERMS_RESTRICTED_UNTIL_FIELD] as string);
                break;
            }
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

export const EditDataUseTermsModal: FC<EditDataUseTermsModalProps> = ({
    lapisUrl,
    clientConfig,
    accessToken,
    sequenceFilter,
    segmentAndGeneInfo,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const openDialog = () => setIsOpen(true);
    const closeDialog = () => setIsOpen(false);

    const detailsHook = lapisClientHooks(lapisUrl).useDetails();

    useEffect(() => {
        detailsHook.mutate({
            ...sequenceFilter.toApiParams(segmentAndGeneInfo),
            fields: ['accession', DATA_USE_TERMS_FIELD, DATA_USE_TERMS_RESTRICTED_UNTIL_FIELD],
        });
    }, [sequenceFilter, segmentAndGeneInfo]);

    const [state, setState] = useState<DataState>({ type: 'loading' });

    useEffect(() => {
        if (detailsHook.isPending) {
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
    }, [detailsHook.data, detailsHook.error, detailsHook.isPending]);

    const sequenceCount = sequenceFilter.sequenceCount();
    let buttonText = 'Edit data use terms (all sequences)';
    if (sequenceCount !== undefined) {
        const formatted = formatNumberWithDefaultLocale(sequenceCount);
        const plural = sequenceCount === 1 ? '' : 's';
        buttonText = `Edit data use terms (${formatted} sequence${plural})`;
    }

    return (
        <>
            <Button className='mr-4 underline text-primary-700 hover:text-primary-500' onClick={openDialog}>
                {buttonText}
            </Button>
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

const EditControl: FC<EditControlProps> = ({ clientConfig, accessToken, state, closeDialog, sequenceFilter }) => {
    const [dataUseTerms, setDataUseTerms] = useState<DataUseTerms | null>(null);

    let affectedAccessions: string[] = [];
    if (dataUseTerms != null) {
        switch (dataUseTerms.type) {
            case openDataUseTermsOption:
                affectedAccessions = Array.from(state.restrictedAccessions.keys());
                break;
            case restrictedDataUseTermsOption:
                affectedAccessions = Array.from(state.restrictedAccessions.entries())
                    .filter(([, date]) => date !== dataUseTerms.restrictedUntil)
                    .map(([accession]) => accession);
        }
    }

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
                        newTerms={{ type: openDataUseTermsOption }}
                        affectedAccessions={affectedAccessions}
                        closeDialog={closeDialog}
                    />
                </div>
            );
        case 'allRestricted': {
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
                            calendarDescription={
                                <>
                                    The release date of a sequence cannot be updated to be later than the date that is
                                    currently set. This means that the new release date can only be between now and the
                                    earliest release date for any of the selected sequences, which is{' '}
                                    <b>{earliestDateDisplay}</b>.
                                </>
                            }
                        />
                    </div>
                    <CancelSubmitButtons
                        clientConfig={clientConfig}
                        accessToken={accessToken}
                        newTerms={dataUseTerms}
                        affectedAccessions={affectedAccessions}
                        closeDialog={closeDialog}
                    />
                </div>
            );
        }
    }
};

interface CancelSubmitButtonProps {
    clientConfig: ClientConfig;
    accessToken: string;
    newTerms: DataUseTerms | null;
    affectedAccessions: string[];
    closeDialog: () => void;
}

const CancelSubmitButtons: FC<CancelSubmitButtonProps> = ({
    clientConfig,
    accessToken,
    closeDialog,
    newTerms,
    affectedAccessions,
}) => {
    const setDataUseTermsHook = backendClientHooks(clientConfig).useSetDataUseTerms(
        { headers: createAuthorizationHeader(accessToken) },
        { onError: errorToast, onSuccess: successToast },
    );

    const updatePossible = newTerms !== null && affectedAccessions.length !== 0;

    const maybeS = affectedAccessions.length > 1 ? 's' : '';
    let buttonText = 'Update';
    if (newTerms) {
        switch (newTerms.type) {
            case restrictedDataUseTermsOption:
                if (affectedAccessions.length !== 0) {
                    buttonText = `Update release date on ${affectedAccessions.length} sequence${maybeS}`;
                } else {
                    buttonText = 'Nothing to update';
                }
                break;
            case openDataUseTermsOption:
                buttonText = `Release ${affectedAccessions.length} sequence${maybeS} now`;
                break;
        }
    }

    return (
        <div className='flex flex-row gap-2 justify-end'>
            <Button className='btn' onClick={closeDialog}>
                Cancel
            </Button>
            <Button
                className='btn loculusColor text-white'
                disabled={!updatePossible}
                onClick={() => {
                    closeDialog();
                    if (newTerms === null) return;
                    setDataUseTermsHook.mutate({
                        accessions: affectedAccessions,
                        newDataUseTerms: newTerms,
                    });
                }}
            >
                {buttonText}
            </Button>
        </div>
    );
};
