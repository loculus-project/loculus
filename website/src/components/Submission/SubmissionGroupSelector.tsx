import { type FC } from 'react';

import { SubmissionRouteUtils } from '../../routes/SubmissionRoute.ts';
import type { Group } from '../../types/backend.ts';
import { Button } from '../common/Button';
import { DropdownMenu, DropdownMenuItem } from '../common/DropdownMenu';
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
        return <div className='mb-2'>{groupNameElement}</div>;
    }

    return (
        <div className='mb-2'>
            <DropdownMenu
                panelClassName='w-52 text-gray-700'
                trigger={
                    <Button className='cursor-pointer'>
                        {groupNameElement} <IwwaArrowDown className='inline-block -mt-1 h-5 w-5' />
                    </Button>
                }
            >
                {groups.map((group) => (
                    <DropdownMenuItem
                        key={group.groupId}
                        href={(() => {
                            const currentRoute = SubmissionRouteUtils.parseToRoute(pathname, search)!;
                            const newRoute = { ...currentRoute, groupId: group.groupId };
                            return SubmissionRouteUtils.toUrl(newRoute);
                        })()}
                    >
                        {group.groupName}
                    </DropdownMenuItem>
                ))}
            </DropdownMenu>
        </div>
    );
};
