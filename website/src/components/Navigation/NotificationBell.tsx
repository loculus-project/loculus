import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';
import { Fragment, useMemo } from 'react';

import type { Organism } from '../../config';
import useClientFlag from '../../hooks/isClient';
import { routes } from '../../routes/routes';
import { backendClientHooks, groupManagementClientHooks } from '../../services/serviceHooks';
import type { ClientConfig } from '../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { withQueryProvider } from '../common/withQueryProvider';
import BellIcon from '~icons/mdi/bell-outline';

interface NotificationBellProps {
    accessToken: string;
    clientConfig: ClientConfig;
    knownOrganisms: Organism[];
}

// How often to poll the backend for the number of sequences awaiting review.
const REFETCH_INTERVAL_MS = 30_000;

const NotificationBellInner = ({ accessToken, clientConfig, knownOrganisms }: NotificationBellProps) => {
    const isClient = useClientFlag();
    const backendHooks = useMemo(() => backendClientHooks(clientConfig), [clientConfig]);
    const groupHooks = useMemo(() => groupManagementClientHooks(clientConfig), [clientConfig]);

    const reviewCountsQuery = backendHooks.useGetReviewCounts(
        { headers: createAuthorizationHeader(accessToken) },
        { refetchInterval: REFETCH_INTERVAL_MS },
    );
    const groupsQuery = groupHooks.useGetGroupsOfUser({ headers: createAuthorizationHeader(accessToken) });

    const reviewCounts = useMemo(
        () => (reviewCountsQuery.data ?? []).filter((entry) => entry.count > 0),
        [reviewCountsQuery.data],
    );

    const organismDisplayNames = useMemo(
        () => new Map(knownOrganisms.map((organism) => [organism.key, organism.displayName])),
        [knownOrganisms],
    );
    const groupNames = useMemo(
        () => new Map((groupsQuery.data ?? []).map((group) => [group.groupId, group.groupName])),
        [groupsQuery.data],
    );

    const totalCount = reviewCounts.reduce((sum, entry) => sum + entry.count, 0);
    const hasNotifications = totalCount > 0;

    return (
        <Menu as='div' className='relative'>
            <MenuButton
                disabled={!isClient}
                className='relative flex items-center p-1 rounded-full text-gray-500 hover:text-gray-700 focus:outline-hidden disabled:opacity-50'
                aria-label={
                    hasNotifications ? `${totalCount} sequences awaiting review` : 'No sequences awaiting review'
                }
                title={hasNotifications ? `${totalCount} sequences awaiting review` : 'No sequences awaiting review'}
            >
                <BellIcon className={`w-6 h-6 ${hasNotifications ? 'text-primary-600' : 'text-gray-400'}`} />
                {hasNotifications && (
                    <span className='absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-semibold leading-none text-white bg-red-500 rounded-full'>
                        {totalCount > 99 ? '99+' : totalCount}
                    </span>
                )}
            </MenuButton>

            <Transition
                as={Fragment}
                enter='transition ease-out duration-100'
                enterFrom='transform opacity-0 scale-95'
                enterTo='transform opacity-100 scale-100'
                leave='transition ease-in duration-75'
                leaveFrom='transform opacity-100 scale-100'
                leaveTo='transform opacity-0 scale-95'
            >
                <MenuItems className='absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-lg shadow-lg border border-gray-200 z-50 focus:outline-hidden'>
                    <div className='px-4 py-2 border-b border-gray-100 text-sm font-semibold text-gray-700'>
                        Sequences awaiting review
                    </div>
                    {!hasNotifications ? (
                        <div className='px-4 py-4 text-sm text-gray-500'>You have no sequences awaiting review.</div>
                    ) : (
                        <div className='py-1 max-h-96 overflow-y-auto'>
                            {reviewCounts.map((entry) => {
                                const organismName = organismDisplayNames.get(entry.organism) ?? entry.organism;
                                const groupName = groupNames.get(entry.groupId) ?? `Group ${entry.groupId}`;

                                return (
                                    <MenuItem key={`${entry.organism}-${entry.groupId}`}>
                                        {({ focus }) => (
                                            <a
                                                href={routes.userSequenceReviewPage(entry.organism, entry.groupId)}
                                                className={`flex items-start justify-between gap-3 px-4 py-2 text-sm ${
                                                    focus ? 'bg-gray-50' : ''
                                                }`}
                                            >
                                                <span className='min-w-0'>
                                                    <span className='block font-medium text-gray-900 truncate'>
                                                        {organismName}
                                                    </span>
                                                    <span className='block text-xs text-gray-500 truncate'>
                                                        {groupName}
                                                    </span>
                                                </span>
                                                <span className='shrink-0 inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-primary-50 text-primary-700 border border-primary-200'>
                                                    {entry.count}
                                                </span>
                                            </a>
                                        )}
                                    </MenuItem>
                                );
                            })}
                        </div>
                    )}
                </MenuItems>
            </Transition>
        </Menu>
    );
};

export const NotificationBell = withQueryProvider(NotificationBellInner);
