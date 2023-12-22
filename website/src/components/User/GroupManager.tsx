import { type FC, type FormEvent, useRef, useState } from 'react';

import { useGroupManagerHooks } from '../../hooks/useGroupOperations.ts';
import type { Group } from '../../types/backend.ts';
import { type ClientConfig } from '../../types/runtimeConfig.ts';
import { ConfirmationDialog } from '../ConfirmationDialog.tsx';
import { ErrorFeedback } from '../ErrorFeedback.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';
import LeaveIcon from '~icons/pepicons-pop/leave-circle-filled';

interface GroupManagerProps {
    clientConfig: ClientConfig;
    accessToken: string;
    username: string;
}

const InnerGroupManager: FC<GroupManagerProps> = ({ clientConfig, accessToken, username }) => {
    const [groupToLeave, setGroupToLeave] = useState<Group | null>(null);
    const [newGroupName, setNewGroupName] = useState<string>('');
    const dialogRef = useRef<HTMLDialogElement>(null);

    const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

    const { createGroup, leaveGroup, groupsOfUser } = useGroupManagerHooks({
        clientConfig,
        accessToken,
        setErrorMessage,
    });

    const handleCreateGroup = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        await createGroup(newGroupName);
        setNewGroupName('');
    };

    const handleLeaveGroup = async () => {
        if (groupToLeave) {
            await leaveGroup(groupToLeave.groupName, username);
            setGroupToLeave(null);
        }
    };

    const handleOpenConfirmationDialog = (group: Group) => {
        setGroupToLeave(group);
        if (dialogRef.current) {
            dialogRef.current.showModal();
        }
    };

    return (
        <div className='p-4'>
            <h2 className='text-2xl mb-4'>Groups</h2>

            {errorMessage !== undefined && (
                <ErrorFeedback message={errorMessage} onClose={() => setErrorMessage(undefined)} />
            )}

            <dialog ref={dialogRef} className='modal'>
                <ConfirmationDialog
                    onConfirmation={handleLeaveGroup}
                    dialogText={`Do you really want to leave the Group ${groupToLeave?.groupName}?`}
                />
            </dialog>

            <form onSubmit={handleCreateGroup}>
                <div className='flex mb-4'>
                    <input
                        type='text'
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value.trim())}
                        placeholder='Enter new group name'
                        className='p-2 border border-gray-300 rounded mr-2'
                        required
                    />
                    <button type='submit' className='px-4 py-2 loculusGreen text-white rounded'>
                        Create Group
                    </button>
                </div>
            </form>

            <ul>
                {!groupsOfUser.isLoading &&
                    groupsOfUser.data?.map((group) => (
                        <li key={group.groupName} className='flex items-center gap-6 bg-gray-100 p-2 mb-2 rounded'>
                            <span className='text-lg'>{group.groupName}</span>
                            <button
                                onClick={() => handleOpenConfirmationDialog(group)}
                                className='px-2 py-1 bg-red-500 text-white rounded'
                                title='Leave group'
                            >
                                <LeaveIcon className='w-4 h-4' />
                            </button>
                        </li>
                    ))}
            </ul>
        </div>
    );
};

export const GroupManager = withQueryProvider(InnerGroupManager);
