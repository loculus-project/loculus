import React, { type FC, useRef, useState } from 'react';

import { ConfirmationDialog } from '../ConfirmationDialog.tsx';
import LeaveIcon from '~icons/pepicons-pop/leave-circle-filled';

type Group = {
    name: string;
};

interface GroupsProps {
    initialGroups: Group[];
}

export const GroupManager: FC<GroupsProps> = ({ initialGroups }) => {
    const [groups, setGroups] = useState<Group[]>(initialGroups);
    const [groupToDelete, setGroupToDelete] = useState<Group | null>(null);
    const [newGroupName, setNewGroupName] = useState<string>('');
    const dialogRef = useRef<HTMLDialogElement>(null);

    const handleCreateGroup = () => {
        if (newGroupName.trim() !== '') {
            const newGroup: Group = {
                name: newGroupName,
            };

            setGroups([...groups, newGroup]);
            setNewGroupName('');
        }
    };

    const handleDeleteGroup = () => {
        const updatedGroups = groups.filter((group) => group.name !== groupToDelete?.name);
        setGroups(updatedGroups);
    };

    const handleOpenConfirmationDialog = (group: Group) => {
        setGroupToDelete(group);
        if (dialogRef.current) {
            dialogRef.current.showModal();
        }
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleCreateGroup();
        }
    };

    return (
        <div className='p-4'>
            <h2 className='text-2xl mb-4'>Groups</h2>

            <dialog ref={dialogRef} className='modal'>
                <ConfirmationDialog
                    onConfirmation={handleDeleteGroup}
                    dialogText={`Do you really want to leave the Group ${groupToDelete?.name}?`}
                />
            </dialog>

            <div className='flex mb-4'>
                <input
                    type='text'
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder='Enter new group name'
                    className='p-2 border border-gray-300 rounded mr-2'
                />
                <button onClick={handleCreateGroup} className='px-4 py-2 loculusGreen text-white rounded'>
                    Create Group
                </button>
            </div>

            <ul>
                {groups.map((group) => (
                    <li key={group.name} className='flex items-center gap-6 bg-gray-100 p-2 mb-2 rounded'>
                        <span className='text-lg'>{group.name}</span>
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
