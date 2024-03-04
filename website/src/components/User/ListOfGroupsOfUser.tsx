import { type FC, useState } from 'react';

import { useRemoveFromGroup } from '../../hooks/useGroupOperations.ts';
import { routes } from '../../routes.ts';
import type { Group } from '../../types/backend.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { displayConfirmationDialog } from '../ConfirmationDialog.tsx';
import { ErrorFeedback } from '../ErrorFeedback.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';
import LeaveIcon from '~icons/pepicons-pop/leave-circle-filled';
import StreamlineUserMultipleGroup from '~icons/streamline/user-multiple-group';

interface ListOfGroupsOfUserProps {
    clientConfig: ClientConfig;
    accessToken: string;
    username: string;
    groupsOfUser: Group[];
}

const InnerListOfGroupsOfUser: FC<ListOfGroupsOfUserProps> = ({
    clientConfig,
    accessToken,
    username,
    groupsOfUser,
}) => {
    const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

    const { removeFromGroup } = useRemoveFromGroup({
        clientConfig,
        accessToken,
        setErrorMessage,
    });

    return (
        <>
            {errorMessage !== undefined && (
                <ErrorFeedback message={errorMessage} onClose={() => setErrorMessage(undefined)} />
            )}
            <ul>
                {groupsOfUser.length > 0 ? (
                    groupsOfUser.map((group) => (
                        <li key={group.groupName} className='flex items-center gap-6 bg-gray-100 p-2 mb-2 rounded'>
                            <a className='text-lg' href={routes.groupOverviewPage(group.groupName)}>
                                <StreamlineUserMultipleGroup className='w-6 h-6 inline-block mr-2' />
                                {group.groupName}
                            </a>
                            <button
                                onClick={() =>
                                    displayConfirmationDialog({
                                        dialogText: `Are you sure you want to leave group ${group.groupName}?`,
                                        onConfirmation: async () => {
                                            await removeFromGroup(group.groupName, username);
                                            window.location.reload();
                                        },
                                    })
                                }
                                className='px-2 py-1 bg-red-500 text-white rounded'
                                title='Leave group'
                                aria-label={`Leave group ${group.groupName}`}
                            >
                                <LeaveIcon className='w-4 h-4' />
                            </button>
                        </li>
                    ))
                ) : (
                    <p className='text-gray-600 text-sm'>
                        You are not currently a member of a group. If you intend to submit sequences, you can{' '}
                        <a
                            href={routes.createGroup()}
                            className='text-primary-500 hover:underline focus:underline active:underline'
                        >
                            create a group
                        </a>
                        , or you can ask an administrator of an existing group to add you to their group.
                    </p>
                )}
            </ul>
        </>
    );
};

export const ListOfGroupsOfUser = withQueryProvider(InnerListOfGroupsOfUser);
