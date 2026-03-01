import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { type FC, type FormEvent, useMemo, useState, type ReactNode } from 'react';

import type { Organism } from '../../config.ts';
import { useGroupPageHooks } from '../../hooks/useGroupOperations.ts';
import { routes } from '../../routes/routes.ts';
import type { ContinueSubmissionIntent } from '../../routes/routes.ts';
import { GROUP_ID_FIELD, IS_REVOCATION_FIELD, VERSION_STATUS_FIELD } from '../../settings.ts';
import type { Address, Group, GroupDetails } from '../../types/backend.ts';
import { versionStatuses } from '../../types/lapis.ts';
import { type ClientConfig } from '../../types/runtimeConfig.ts';
import { displayConfirmationDialog } from '../ConfirmationDialog.js';
import { ErrorFeedback } from '../ErrorFeedback.tsx';
import { Button } from '../common/Button';
import { withQueryProvider } from '../common/withQueryProvider.tsx';
import DashiconsGroups from '~icons/dashicons/groups';
import DashiconsPlus from '~icons/dashicons/plus';
import IwwaArrowDown from '~icons/iwwa/arrow-down';

type GroupPageProps = {
    prefetchedGroupDetails: GroupDetails;
    clientConfig: ClientConfig;
    accessToken: string | undefined;
    username: string;
    userGroups: Group[];
    organisms: Organism[];
    databaseName: string;
    continueSubmissionIntent?: ContinueSubmissionIntent;
    loginUrl: string;
};

const InnerGroupPage: FC<GroupPageProps> = ({
    prefetchedGroupDetails,
    clientConfig,
    accessToken,
    username,
    userGroups,
    organisms,
    databaseName,
    continueSubmissionIntent,
    loginUrl,
}) => {
    const groupName = prefetchedGroupDetails.group.groupName;
    const groupId = prefetchedGroupDetails.group.groupId;
    const [newUserName, setNewUserName] = useState<string>('');

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

    const userIsGroupMember = groupDetails.data.users?.some((user) => user.name === username) ?? false;
    const userHasEditPrivileges = userGroups.some((group) => group.groupId === prefetchedGroupDetails.group.groupId);

    const { data: sequenceCounts, isLoading: sequenceCountsLoading } = useQuery({
        queryKey: ['group-sequence-counts', groupId, clientConfig, organisms],
        queryFn: () => fetchSequenceCounts(groupId, clientConfig, organisms),
    });

    const continueSubmissionCta = useMemo(() => {
        if (continueSubmissionIntent === undefined) {
            return undefined;
        }

        const organismDetails = organisms.find((organism) => organism.key === continueSubmissionIntent.organism);
        if (organismDetails === undefined) {
            return undefined;
        }

        return {
            href: routes.submissionPage(organismDetails.key, groupId),
            organismDisplayName: organismDetails.displayName,
        };
    }, [continueSubmissionIntent, organisms, groupId]);

    return (
        <div className='flex flex-col h-full p-4'>
            {errorMessage !== undefined && (
                <ErrorFeedback message={errorMessage} onClose={() => setErrorMessage(undefined)} />
            )}

            {continueSubmissionCta !== undefined && (
                <div className='bg-blue-50 border border-blue-200 rounded-md p-4 mb-4 text-blue-900'>
                    <h2 className='font-semibold text-blue-900 text-lg'>Continue your submission</h2>
                    <p className='mt-2 text-sm'>
                        You are now part of the {groupName} group. Continue your submission journey for{' '}
                        {continueSubmissionCta.organismDisplayName}.
                    </p>
                    <a
                        href={continueSubmissionCta.href}
                        className='inline-block mt-3 px-4 py-2 loculusColor text-white rounded'
                    >
                        Open submission portal
                    </a>
                </div>
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
                        <>
                            <a
                                href={routes.editGroupPage(groupId)}
                                className='object-right p-2 loculusColor text-white rounded px-4 mr-2'
                            >
                                Edit group
                            </a>
                            <Button
                                className='object-right p-2 loculusColor text-white rounded px-4'
                                onClick={() => {
                                    const isLastMember = (groupDetails.data.users?.length ?? 0) <= 1;
                                    const lastMemberWarning =
                                        'You are the last user in this group. Leaving will leave the group without any members, meaning that nobody is able to add future members. ';
                                    const dialogText = `${isLastMember ? lastMemberWarning : ''}Are you sure you want to leave the ${groupName} group?`;

                                    displayConfirmationDialog({
                                        dialogText,
                                        onConfirmation: async () => {
                                            await removeFromGroup(username);
                                            window.location.href = routes.userOverviewPage();
                                        },
                                    });
                                }}
                            >
                                Leave group
                            </Button>
                        </>
                    )}
                </div>
            ) : (
                <h1 className='flex flex-col title flex-grow'>
                    <label className='block title'>Group: {groupName}</label>
                </h1>
            )}

            <div className=' max-w-2xl mx-auto px-10 py-4 bg-gray-100 rounded-md my-4'>
                <table className='w-full'>
                    <tbody>
                        <TableRow label='Group ID'>{groupDetails.data.group.groupId}</TableRow>
                        <TableRow label='Institution'>{groupDetails.data.group.institution}</TableRow>
                        {accessToken && (
                            <TableRow label='Contact email'>{groupDetails.data.group.contactEmail}</TableRow>
                        )}
                        <TableRow label='Address'>
                            <PostalAddress address={groupDetails.data.group.address} />
                        </TableRow>
                    </tbody>
                </table>
                <div className='w-full mt-2 text-center'>
                    {!accessToken && (
                        <span className='text-sm italic'>
                            <a href={loginUrl} className='underline cursor-pointer'>
                                Log in
                            </a>{' '}
                            to {databaseName} to see contact details for the group.
                        </span>
                    )}
                </div>
            </div>

            <div className=' max-w-2xl mx-auto px-10 py-4 bg-gray-100 rounded-md my-4'>
                <h2 className='text-lg font-bold mb-2'>Sequences available in {databaseName}</h2>
                <table className='w-full'>
                    <tbody>
                        {organisms.map((organism) => (
                            <TableRow key={organism.key} label={organism.displayName}>
                                {sequenceCountsLoading ? (
                                    <span className='loading loading-spinner loading-xs'></span>
                                ) : (
                                    <a
                                        href={`${routes.searchPage(organism.key)}?${GROUP_ID_FIELD}=${groupId}`}
                                        className='underline'
                                    >
                                        {sequenceCounts?.[organism.key] ?? 0}
                                    </a>
                                )}
                            </TableRow>
                        ))}
                    </tbody>
                </table>
            </div>

            {userHasEditPrivileges && (
                <>
                    <h2 className='text-lg font-bold py-4'> Users </h2>
                    <form onSubmit={(event) => void handleAddUser(event)}>
                        <div className='flex mb-4'>
                            <input
                                type='text'
                                value={newUserName}
                                onChange={(e) => setNewUserName(e.target.value.trim())}
                                placeholder='Enter new user name'
                                className='p-2 border border-gray-300 rounded mr-2'
                                required
                            />
                            <Button type='submit' className='px-4 py-2 loculusColor text-white rounded'>
                                Add user
                            </Button>
                        </div>
                    </form>
                    <div className='flex-1 overflow-y-auto'>
                        <ul>
                            {groupDetails.data.users?.map((user) => (
                                <li key={user.name} className='flex items-center gap-6 bg-gray-100 p-2 mb-2 rounded'>
                                    <span className='text-lg'>{user.name}</span>
                                    {user.name !== username && (
                                        <Button
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
                                        >
                                            Remove user
                                        </Button>
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

async function fetchSequenceCounts(groupId: number, clientConfig: ClientConfig, organisms: Organism[]) {
    const counts: Record<string, number> = {};
    await Promise.all(
        organisms.map(async ({ key }) => {
            const url = clientConfig.lapisUrls[key];
            if (!url) {
                counts[key] = 0;
                return;
            }
            try {
                const response = await axios.post(`${url}/sample/aggregated`, {
                    [GROUP_ID_FIELD]: groupId,
                    [VERSION_STATUS_FIELD]: versionStatuses.latestVersion,
                    [IS_REVOCATION_FIELD]: 'false',
                    fields: [],
                });
                const count = (response.data as { data?: { count?: number }[] }).data?.[0]?.count ?? 0;
                counts[key] = count;
            } catch {
                counts[key] = 0;
            }
        }),
    );
    return counts;
}

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

const TableRow = ({ label, children }: { label: string | undefined; children: ReactNode }) => (
    <tr className='border-b border-gray-200'>
        <td className='py-2 pr-4 text-right align-top'>
            <span className='text-lg font-semibold text-gray-800'>{label}</span>
        </td>
        <td className='py-2 pl-4'>
            <span className='text-lg text-gray-900'>{children}</span>
        </td>
    </tr>
);
