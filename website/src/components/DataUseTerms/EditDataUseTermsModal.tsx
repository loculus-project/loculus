import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { DateTime } from 'luxon';
import { useEffect, useState, type FC } from 'react';
import { toast } from 'react-toastify';

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
import { stringifyMaybeAxiosError } from '../../utils/stringifyMaybeAxiosError';
import type { SequenceFilter } from '../SearchPage/DownloadDialog/SequenceFilters';
import { ActiveFilters } from '../common/ActiveFilters';
import { BaseDialog } from '../common/BaseDialog';
import { Button } from '../common/Button';
import IwwaArrowDown from '~icons/iwwa/arrow-down';

interface EditDataUseTermsModalProps {
    lapisUrl: string;
    clientConfig: ClientConfig;
    accessToken?: string;
    sequenceFilter: SequenceFilter;
    organism: string;
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
    organism,
}) => {
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isRevokeOpen, setIsRevokeOpen] = useState(false);
    const openEditDialog = () => setIsEditOpen(true);
    const closeEditDialog = () => setIsEditOpen(false);
    const openRevokeDialog = () => setIsRevokeOpen(true);
    const closeRevokeDialog = () => setIsRevokeOpen(false);

    const detailsHook = lapisClientHooks(lapisUrl).useDetails();

    useEffect(() => {
        detailsHook.mutate({
            ...sequenceFilter.toApiParams(),
            fields: ['accession', DATA_USE_TERMS_FIELD, DATA_USE_TERMS_RESTRICTED_UNTIL_FIELD],
        });
    }, [sequenceFilter]);

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
    let buttonText = 'Action (all sequences)';
    if (sequenceCount !== undefined) {
        const formatted = formatNumberWithDefaultLocale(sequenceCount);
        const plural = sequenceCount === 1 ? '' : 's';
        buttonText = `Action (${formatted} sequence${plural})`;
    }

    return (
        <>
            <Menu as='div' className='mr-4 relative inline-block text-left'>
                <MenuButton className='underline text-primary-700 hover:text-primary-500 flex items-center'>
                    <span>{buttonText}</span>
                    <IwwaArrowDown className='ml-2 h-4 w-4' aria-hidden='true' />
                </MenuButton>

                <MenuItems className='absolute left-0 mt-2 w-56 origin-top-left rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10'>
                    <div className='py-1'>
                        <MenuItem>
                            {({ focus }) => (
                                <Button
                                    onClick={openEditDialog}
                                    className={`
                                        ${focus ? 'bg-gray-100 text-gray-900' : 'text-gray-700'}
                                        block px-4 py-2 text-sm w-full text-left
                                    `}
                                >
                                    Edit data use terms
                                </Button>
                            )}
                        </MenuItem>
                        <MenuItem>
                            {({ focus }) => (
                                <Button
                                    onClick={openRevokeDialog}
                                    className={`
                                        ${focus ? 'bg-gray-100 text-gray-900' : 'text-gray-700'}
                                        block px-4 py-2 text-sm w-full text-left
                                    `}
                                >
                                    Revoke
                                </Button>
                            )}
                        </MenuItem>
                    </div>
                </MenuItems>
            </Menu>
            <BaseDialog title='Edit data use terms' isOpen={isEditOpen} onClose={closeEditDialog}>
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
                            closeDialog={closeEditDialog}
                            sequenceFilter={sequenceFilter}
                        />
                    ))}
            </BaseDialog>
            <BaseDialog title='Revoke sequences' isOpen={isRevokeOpen} onClose={closeRevokeDialog}>
                {state.type === 'loading' && 'loading'}
                {state.type === 'error' && `error: ${state.error}`}
                {state.type === 'loaded' &&
                    (accessToken === undefined ? (
                        <p>You need to be logged in to revoke sequences.</p>
                    ) : (
                        <RevokeControl
                            clientConfig={clientConfig}
                            accessToken={accessToken}
                            organism={organism}
                            state={state}
                            closeDialog={closeRevokeDialog}
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

interface RevokeControlProps {
    clientConfig: ClientConfig;
    accessToken: string;
    organism: string;
    state: LoadedState;
    sequenceFilter: SequenceFilter;
    closeDialog: () => void;
}

const RevokeControl: FC<RevokeControlProps> = ({
    clientConfig,
    accessToken,
    organism,
    state,
    closeDialog,
    sequenceFilter,
}) => {
    const [versionComment, setVersionComment] = useState('');

    const hooks = backendClientHooks(clientConfig);
    const useRevokeSequenceEntries = hooks.useRevokeSequences(
        {
            headers: createAuthorizationHeader(accessToken),
            params: { organism },
        },
        {
            onSuccess: () => {
                toast.success('Sequences revoked successfully', {
                    position: 'top-center',
                    autoClose: 5000,
                });
                closeDialog();
            },
            onError: (error) =>
                toast.error('Failed to revoke sequences: ' + stringifyMaybeAxiosError(error), {
                    position: 'top-center',
                    autoClose: false,
                }),
        },
    );

    const allAccessions = [...state.openAccessions, ...Array.from(state.restrictedAccessions.keys())];

    const handleRevoke = () => {
        useRevokeSequenceEntries.mutate({
            accessions: allAccessions,
            versionComment,
        });
    };

    return (
        <div className='space-y-4'>
            <ActiveFilters sequenceFilter={sequenceFilter} />
            <p className='font-semibold'>
                Are you sure you want to create revocation entries for the following {state.totalCount} sequence
                {state.totalCount > 1 ? 's' : ''}?
            </p>
            <div className='bg-yellow-50 border-l-4 border-yellow-400 p-4'>
                <div className='flex'>
                    <div className='flex-shrink-0'>
                        <svg
                            className='h-5 w-5 text-yellow-400'
                            viewBox='0 0 20 20'
                            fill='currentColor'
                            aria-hidden='true'
                        >
                            <path
                                fillRule='evenodd'
                                d='M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z'
                                clipRule='evenodd'
                            />
                        </svg>
                    </div>
                    <div className='ml-3'>
                        <p className='text-sm text-yellow-700'>
                            <strong>Warning:</strong> Revocation will suppress these sequences by default in searches
                            and mark all previous entries as having been revoked. This action creates new revocation
                            entries in the database.
                        </p>
                    </div>
                </div>
            </div>
            <div className='mt-4'>
                <label htmlFor='revoke-reason' className='block text-sm font-medium text-gray-700 mb-2'>
                    Reason for revocation (optional)
                </label>
                <input
                    id='revoke-reason'
                    type='text'
                    value={versionComment}
                    onChange={(e) => setVersionComment(e.target.value)}
                    placeholder='Enter reason for revocation'
                    className='w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500'
                />
            </div>
            <div className='flex flex-row gap-2 justify-end mt-6'>
                <Button className='btn' onClick={closeDialog}>
                    Cancel
                </Button>
                <Button className='btn bg-red-600 text-white hover:bg-red-700' onClick={handleRevoke}>
                    Revoke {state.totalCount} sequence{state.totalCount > 1 ? 's' : ''}
                </Button>
            </div>
        </div>
    );
};
