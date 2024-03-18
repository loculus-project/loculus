import { type FC, type FormEvent, useRef, useState } from 'react';

import { useGroupPageHooks } from '../../hooks/useGroupOperations.ts';
import { routes } from '../../routes/routes.ts';
import type { Address, GroupDetails } from '../../types/backend.ts';
import { type ClientConfig } from '../../types/runtimeConfig.ts';
import { ConfirmationDialog } from '../DeprecatedConfirmationDialog.tsx';
import { ErrorFeedback } from '../ErrorFeedback.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';
import DeleteIcon from '~icons/ci/user-remove';
import IwwaArrowDown from '~icons/iwwa/arrow-down';

type GroupPageProps = {
    prefetchedGroupDetails: GroupDetails;
    clientConfig: ClientConfig;
    accessToken: string;
    username: string;
    groupName: string;
    userGroupNames: string[];
};

const InnerGroupPage: FC<GroupPageProps> = ({
    prefetchedGroupDetails,
    clientConfig,
    accessToken,
    username,
    groupName,
    userGroupNames,
}) => {
    const [newUserName, setNewUserName] = useState<string>('');
    const [userToDelete, setUserToDelete] = useState<string | null>(null);
    const dialogRef = useRef<HTMLDialogElement>(null);

    const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

    const { groupDetails, removeFromGroup, addUserToGroup } = useGroupPageHooks({
        clientConfig,
        accessToken,
        setErrorMessage,
        prefetchedGroupDetails,
    });

    const handleAddUser = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        await addUserToGroup(newUserName);
        setNewUserName('');
    };

    const handleDeleteUser = async () => {
        if (userToDelete !== null) {
            await removeFromGroup(userToDelete);
            if (userToDelete === username) {
                window.location.href = routes.userOverviewPage();
            } else {
                setUserToDelete(null);
            }
        }
    };

    const handleOpenConfirmationDialog = (username: string) => {
        setUserToDelete(username);
        if (dialogRef.current) {
            dialogRef.current.showModal();
        }
    };

    return (
        <div className='flex flex-col h-full p-4'>
            <dialog ref={dialogRef} className='modal'>
                <ConfirmationDialog
                    onConfirmation={handleDeleteUser}
                    dialogText={`Do you really want to remove the user ${userToDelete}?`}
                />
            </dialog>

            {errorMessage !== undefined && (
                <ErrorFeedback message={errorMessage} onClose={() => setErrorMessage(undefined)} />
            )}

            <div className='flex items-center'>
                <h1 className='flex flex-row gap-4 title flex-grow'>
                    <label className='py-1 block title'>Group:</label>
                    <div className='dropdown dropdown-hover hidden sm:flex relative'>
                        <label tabIndex={0} className='py-1 block cursor-pointer title'>
                            {groupName}
                            <span className='text-primary'>
                                <IwwaArrowDown className='inline-block -mt-1 ml-1 h-4 w-4 ' />
                            </span>
                        </label>
                        <ul
                            tabIndex={0}
                            className='dropdown-content z-[1] menu p-1 shadow bg-base-100 rounded-btn absolute top-full -left-4 min-w-56'
                        >
                            {userGroupNames.map(
                                (name: string) =>
                                    name !== groupName && (
                                        <li key={name}>
                                            <a href={routes.groupOverviewPage(name)}>{name}</a>
                                        </li>
                                    ),
                            )}
                            <li>
                                <a href={routes.createGroup()}>Create a new group...</a>
                            </li>
                        </ul>
                    </div>
                </h1>
                <button
                    onClick={() => handleOpenConfirmationDialog(username)}
                    className='object-right p-2 bg-red-500 text-white rounded'
                >
                    Leave Group
                </button>
            </div>

            <h2 className='text-lg font-bold py-4'> Information </h2>
            <div className='bg-gray-100 p-4 mb-4 rounded'>
                <table className='w-full'>
                    <tbody>
                        <tr>
                            <td className='text-lg font-bold'>Institution:</td>
                            <td className='text-lg'>{groupDetails.data?.group.institution}</td>
                        </tr>
                        <tr>
                            <td className='text-lg font-bold'>Contact Email:</td>
                            <td className='text-lg'>{groupDetails.data?.group.contactEmail}</td>
                        </tr>
                        <tr>
                            <td className='text-lg font-bold'>Address:</td>
                            <td className='text-lg'>
                                <PostalAddress address={groupDetails.data?.group.address} />
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {(groupDetails.data?.users.some((user) => user.name === username) ?? false) && (
                <>
                    <h2 className='text-lg font-bold py-4'> Users </h2>
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
                            <button type='submit' className='px-4 py-2 loculusColor text-white rounded'>
                                Add User
                            </button>
                        </div>
                    </form>
                    <div className='flex-1 overflow-y-auto'>
                        <ul>
                            {groupDetails.data?.users.map((user) => (
                                <li key={user.name} className='flex items-center gap-6 bg-gray-100 p-2 mb-2 rounded'>
                                    <span className='text-lg'>{user.name}</span>
                                    <button
                                        onClick={() => handleOpenConfirmationDialog(user.name)}
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
                </>
            )}
        </div>
    );
};

export const GroupPage = withQueryProvider(InnerGroupPage);

const PostalAddress: FC<{ address: Address | undefined }> = ({ address }) => {
    if (address === undefined) {
        return '';
    }
    return (
        <div>
            {address.line1} <br />
            {address.line2 !== '' ? `${address.line2}` : null}
            {address.line2 !== '' ? <br /> : null} {address.postalCode} {address.city} <br />
            {address.state !== '' ? `${address.state}` : null}
            {address.state !== '' ? <br /> : null}
            {address.country}
        </div>
    );
};
