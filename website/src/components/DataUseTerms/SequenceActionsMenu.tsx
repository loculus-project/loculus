import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { DateTime } from 'luxon';
import { useEffect, useState, type FC } from 'react';

import { EditDataUseTermsModal, type DataState, type LoadedState, type ResultType } from './EditDataUseTermsModal';
import { RevokeSequencesModal } from './RevokeSequencesModal';
import { lapisClientHooks } from '../../services/serviceHooks';
import { DATA_USE_TERMS_FIELD, DATA_USE_TERMS_RESTRICTED_UNTIL_FIELD } from '../../settings';
import { openDataUseTermsOption, restrictedDataUseTermsOption, type DataUseTermsOption } from '../../types/backend';
import type { Details } from '../../types/lapis';
import type { ClientConfig } from '../../types/runtimeConfig';
import { formatNumberWithDefaultLocale } from '../../utils/formatNumber';
import type { SequenceFilter } from '../SearchPage/DownloadDialog/SequenceFilters';
import { Button } from '../common/Button';
import IwwaArrowDown from '~icons/iwwa/arrow-down';

interface SequenceActionsMenuProps {
    lapisUrl: string;
    clientConfig: ClientConfig;
    accessToken?: string;
    sequenceFilter: SequenceFilter;
    organism: string;
}

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

export const SequenceActionsMenu: FC<SequenceActionsMenuProps> = ({
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

    const allAccessions =
        state.type === 'loaded' ? [...state.openAccessions, ...Array.from(state.restrictedAccessions.keys())] : [];

    const totalCount = state.type === 'loaded' ? state.totalCount : 0;

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
            <EditDataUseTermsModal
                lapisUrl={lapisUrl}
                clientConfig={clientConfig}
                accessToken={accessToken}
                sequenceFilter={sequenceFilter}
                state={state}
                isOpen={isEditOpen}
                onClose={closeEditDialog}
            />
            <RevokeSequencesModal
                clientConfig={clientConfig}
                accessToken={accessToken}
                organism={organism}
                sequenceFilter={sequenceFilter}
                accessions={allAccessions}
                totalCount={totalCount}
                isOpen={isRevokeOpen}
                onClose={closeRevokeDialog}
            />
        </>
    );
};
