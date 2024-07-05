import { type FC, type FormEvent, useState } from 'react';

import useClientFlag from '../../hooks/isClient.ts';
import { useGroupPageHooks } from '../../hooks/useGroupOperations.ts';
import { routes } from '../../routes/routes.ts';
import type { Address, Group, GroupDetails } from '../../types/backend.ts';
import { type ClientConfig } from '../../types/runtimeConfig.ts';
import { displayConfirmationDialog } from '../ConfirmationDialog.js';
import { ErrorFeedback } from '../ErrorFeedback.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';
import DashiconsGroups from '~icons/dashicons/groups';
import DashiconsPlus from '~icons/dashicons/plus';
import IwwaArrowDown from '~icons/iwwa/arrow-down';

type GroupPageProps = {
    prefetchedGroupDetails: GroupDetails;
    clientConfig: ClientConfig;
    accessToken: string;
    username: string;
    userGroups: Group[];
};

const InnerGroupPage: FC<GroupPageProps> = ({
    prefetchedGroupDetails,
    clientConfig,
    accessToken,
    username,
    userGroups,
}) => {
    const groupName = prefetchedGroupDetails.group.groupName;
    const [newUserName, setNewUserName] = useState<string>('');

    const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

    const isClient = useClientFlag();

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

    const userIsGroupMember = groupDetails.data?.users.some((user) => user.name === username) ?? false;
    const userHasEditPrivileges = userGroups.some((group) => group.groupId === prefetchedGroupDetails.group.groupId);

    return (
        <div className='flex flex-col h-full p-4'>
            {errorMessage !== undefined && (
                <ErrorFeedback message={errorMessage} onClose={() => setErrorMessage(undefined)} />
            )}

            {userHasEditPrivileges ? (
                <div className='flex items-center'>
                    <h1 className='flex flex-row gap-4 title flex-grow'>
                        <label className='mt-1.5'>
                            <DashiconsGroups />
                        </label>
                        <div className='dropdown dropdown-hover hidden sm:flex relative'>
                            <label tabIndex={0} className='py-1 block cursor-pointer title'>
                                {groupName}
                                <span className='text-primary'>
                                    <IwwaArrowDown className='inline-block -mt-1 ml-1 h-4 w-4 ' />
                                </span>
                            </label>
                            <ul
                                tabIndex={0}
                                className='dropdown-content z-[1] menu p-1 shadow bg-base-100 rounded-btn absolute top-full -left-4 min-w-60'
                            >
                                {userGroups.map(
                                    (group) =>
                                        group.groupId !== prefetchedGroupDetails.group.groupId && (
                                            <li key={group.groupId}>
                                                <a href={routes.groupOverviewPage(group.groupId)}>
                                                    <DashiconsGroups className='w-6 h-6 inline-block mr-2' />
                                                    {group.groupName}
                                                </a>
                                            </li>
                                        ),
                                )}
                                <li>
                                    <a href={routes.createGroup()}>
                                        <DashiconsPlus className='w-6 h-6 inline-block mr-2' />
                                        Create a new group...
                                    </a>
                                </li>
                            </ul>
                        </div>
                    </h1>
                    {userIsGroupMember && (
                        <button
                            onClick={() => {
                                displayConfirmationDialog({
                                    dialogText: `Are you sure you want to leave the ${groupName} group?`,

                                    onConfirmation: async () => {
                                        await removeFromGroup(username);
                                        window.location.href = routes.userOverviewPage();
                                    },
                                });
                            }}
                            className='object-right p-2 loculusColor text-white rounded px-4'
                            disabled={!isClient}
                        >
                            Leave group
                        </button>
                    )}
                </div>
            ) : (
                <h1 className='flex flex-row gap-4 title flex-grow'>
                    <label className='block title'>Group:</label>
                    {groupName}
                </h1>
            )}

            <div className='bg-gray-100 p-4 mb-4 rounded'>
                <table className='w-full'>
                    <tbody>
                        <tr>
                            <td className='text-lg font-bold text-right'>Group ID</td>
                            <td className='text-lg'>{groupDetails.data?.group.groupId}</td>
                        </tr>
                        <tr>
                            <td className='text-lg font-bold text-right'>Institution</td>
                            <td className='text-lg'>{groupDetails.data?.group.institution}</td>
                        </tr>
                        <tr>
                            <td className='text-lg font-bold text-right'>Contact email</td>
                            <td className='text-lg'>{groupDetails.data?.group.contactEmail}</td>
                        </tr>
                        <tr>
                            <td className='text-lg font-bold text-right'>Address</td>
                            <td className='text-lg'>
                                <PostalAddress address={groupDetails.data?.group.address} />
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {userHasEditPrivileges && (
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
                            <button
                                type='submit'
                                className='px-4 py-2 loculusColor text-white rounded'
                                disabled={!isClient}
                            >
                                Add user
                            </button>
                        </div>
                    </form>
                    <div className='flex-1 overflow-y-auto'>
                        <ul>
                            {groupDetails.data?.users.map((user) => (
                                <li key={user.name} className='flex items-center gap-6 bg-gray-100 p-2 mb-2 rounded'>
                                    <span className='text-lg'>{user.name}</span>
                                    {user.name !== username && (
                                        <button
                                            onClick={() => {
                                                displayConfirmationDialog({
                                                    dialogText: `Are you sure you want to remove ${user.name} from the group ${groupName}?`,
                                                    onConfirmation: async () => {
                                                        await removeFromGroup(user.name);
                                                    },
                                                });
                                            }}
                                            className='px-2 py-1 loculusColor text-white rounded'
                                            title='Remove user from group'
                                            aria-label={`Remove User ${user.name}`}
                                            disabled={!isClient}
                                        >
                                            Remove user
                                        </button>
                                    )}
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
