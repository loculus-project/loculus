import { type FC, useRef, useState } from 'react';

import { ConfirmationDialog } from '../ConfirmationDialog.tsx';
import DeleteIcon from '~icons/ci/user-remove';

type User = {
    name: string;
};

interface GroupPageProps {
    users: User[];
}

export const GroupPage: FC<GroupPageProps> = ({ users }) => {
    const [newUserName, setNewUserName] = useState<string>('');
    const [userToDelete, setUserToDelete] = useState<User | null>(null);
    const dialogRef = useRef<HTMLDialogElement>(null);

    const handleAddUser = () => {
        if (newUserName.trim() !== '') {
            // TODO: Add logic to update the state or send the new user data to the server

            setNewUserName('');
        }
    };

    const handleDeleteUser = () => {
        if (userToDelete) {
            // TODO: Add logic to update the state or send the delete request to the server
        }
    };

    const handleOpenConfirmationDialog = (user: User) => {
        setUserToDelete(user);
        if (dialogRef.current) {
            dialogRef.current.showModal();
        }
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleAddUser();
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

            <div className='flex mb-4'>
                <input
                    type='text'
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder='Enter new user name'
                    className='p-2 border border-gray-300 rounded mr-2'
                />
                <button onClick={handleAddUser} className='px-4 py-2 pathoplexusGreen text-white rounded'>
                    Add User
                </button>
            </div>

            <div className='flex-1 overflow-y-auto'>
                <ul>
                    {users.map((user) => (
                        <li key={user.name} className='flex items-center gap-6 bg-gray-100 p-2 mb-2 rounded'>
                            <span className='text-lg'>{user.name}</span>
                            <button
                                onClick={() => handleOpenConfirmationDialog(user)}
                                className='px-2 py-1 bg-red-500 text-white rounded'
                                title='Remove user from group'
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
