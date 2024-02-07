import { type FC, type FormEvent, useRef, useState } from 'react';

import { useGroupPageHooks } from '../../hooks/useGroupOperations.ts';
import { type ClientConfig } from '../../types/runtimeConfig.ts';
import { ConfirmationDialog } from '../DeprecatedConfirmationDialog.tsx';
import { ErrorFeedback } from '../ErrorFeedback.tsx';
import { withQueryProvider } from '../common/withProvider.tsx';
import DeleteIcon from '~icons/ci/user-remove';

type User = {
    name: string;
};

type GroupPageProps = {
    groupName: string;
    clientConfig: ClientConfig;
    accessToken: string;
};

const InnerGroupPage: FC<GroupPageProps> = ({ groupName, clientConfig, accessToken }) => {
    const [newUserName, setNewUserName] = useState<string>('');
    const [userToDelete, setUserToDelete] = useState<User | null>(null);
    const dialogRef = useRef<HTMLDialogElement>(null);

    const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

    const { groupDetails, removeFromGroup, addUserToGroup } = useGroupPageHooks({
        clientConfig,
        accessToken,
        setErrorMessage,
        groupName,
    });

    const handleAddUser = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        await addUserToGroup(newUserName);
        setNewUserName('');
    };

    const handleDeleteUser = async () => {
        if (userToDelete) {
            await removeFromGroup(userToDelete.name);
            setUserToDelete(null);
        }
    };

    const handleOpenConfirmationDialog = (user: User) => {
        setUserToDelete(user);
        if (dialogRef.current) {
            dialogRef.current.showModal();
        }
    };

    return (
        <div className='flex flex-col h-full p-4'>
            <dialog ref={dialogRef} className='modal'>
                <ConfirmationDialog
                    onConfirmation={handleDeleteUser}
                    dialogText={`Do you really want to remove the user ${userToDelete?.name}?`}
                />
            </dialog>

            {errorMessage !== undefined && (
                <ErrorFeedback message={errorMessage} onClose={() => setErrorMessage(undefined)} />
            )}

            <form onSubmit={handleAddUser}>
                <div className='flex mb-4'>
                    <input
                        type='text'
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value.trim())}
                        placeholder='Enter new user name'
                        className='p-2 border border-gray-300 rounded mr-2'
                        required
                    />
                    <button type='submit' className='px-4 py-2 loculusGreen text-white rounded'>
                        Add User
                    </button>
                </div>
            </form>

            <div className='flex-1 overflow-y-auto'>
                <ul>
                    {!groupDetails.isLoading &&
                        groupDetails.data &&
                        groupDetails.data.users.map((user) => (
                            <li key={user.name} className='flex items-center gap-6 bg-gray-100 p-2 mb-2 rounded'>
                                <span className='text-lg'>{user.name}</span>
                                <button
                                    onClick={() => handleOpenConfirmationDialog(user)}
                                    className='px-2 py-1 bg-red-500 text-white rounded'
                                    title='Remove user from group'
                                    aria-label={`Remove User ${user.name}`}
                                >
                                    <DeleteIcon className='w-4 h-4' />
                                </button>
                            </li>
                        ))}
                </ul>
            </div>
        </div>
    );
};

export const GroupPage = withQueryProvider(InnerGroupPage);
