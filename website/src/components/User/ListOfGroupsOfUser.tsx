import { type FC, useState } from 'react';
import { toast } from 'react-toastify';

import { routes } from '../../routes/routes.ts';
import type { Group } from '../../types/backend.ts';
import { withQueryProvider } from '../common/withQueryProvider.tsx';
import StreamlineUserMultipleGroup from '~icons/streamline/user-multiple-group';

interface ListOfGroupsOfUserProps {
    groupsOfUser: Group[];
}

const InnerListOfGroupsOfUser: FC<ListOfGroupsOfUserProps> = ({ groupsOfUser }) => {
    const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

    return (
        <>
            {errorMessage !== undefined && (
                toast.error(errorMessage, { onClose: () => setErrorMessage(undefined) })
            )}
            <ul>
                {groupsOfUser.length > 0 ? (
                    groupsOfUser.map((group) => (
                        <li key={group.groupName} className='flex items-center gap-6 bg-gray-100 p-2 mb-2 rounded'>
                            <a className='text-lg' href={routes.groupOverviewPage(group.groupId)}>
                                <StreamlineUserMultipleGroup className='w-6 h-6 inline-block mr-2' />
                                {group.groupName}
                            </a>
                        </li>
                    ))
                ) : (
                    <p className='text-gray-600 text-sm'>
                        You are not currently a member of a submitting group. If you intend to submit sequences, please
                        create a group or ask an administrator of an existing group to add you to their group.
                    </p>
                )}
            </ul>
        </>
    );
};

export const ListOfGroupsOfUser = withQueryProvider(InnerListOfGroupsOfUser);
