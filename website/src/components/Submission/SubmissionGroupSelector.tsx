import { type FC } from 'react';

import { SubmissionRouteUtils } from '../../routes/SubmissionRoute.ts';
import type { Group } from '../../types/backend.ts';
import DashiconsGroups from '~icons/dashicons/groups';
import IwwaArrowDown from '~icons/iwwa/arrow-down';

type GroupSelectorProps = {
    groups: Group[];
    selectedGroupId: number;
    pathname: string;
    search: string;
};

export const SubmissionGroupSelector: FC<GroupSelectorProps> = ({ groups, selectedGroupId, pathname, search }) => {
    const selectedGroup = groups.find((group) => group.groupId === selectedGroupId);

    if (selectedGroup === undefined) {
        return null;
    }

    const groupNameElement = (
        <>
            <DashiconsGroups className='w-6 h-6 inline-block mr-1 -mt-1 text-gray-600' />
            <span className='text-gray-700'>{selectedGroup.groupName}</span>
        </>
    );

    if (groups.length === 1) {
        return <div className='mb-2 ml-4'>{groupNameElement}</div>;
    }

    return (
        <div className='mb-2 ml-4'>
            <div className='dropdown'>
                <div tabIndex={0} role='button' className=''>
                    {groupNameElement} <IwwaArrowDown className='inline-block -mt-1 h-5 w-5' />
                </div>
                <ul tabIndex={0} className='dropdown-content z-20 menu p-2 shadow bg-base-100 w-52 text-gray-700'>
                    {groups.map((group) => (
                        <li key={group.groupId}>
                            <a
                                href={(() => {
                                    const currentRoute = SubmissionRouteUtils.parseToRoute(pathname, search)!;
                                    const newRoute = { ...currentRoute, groupId: group.groupId };
                                    return SubmissionRouteUtils.toUrl(newRoute);
                                })()}
                            >
                                {group.groupName}
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};
