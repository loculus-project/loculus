import { type FC } from 'react';

import { routes } from '../../routes/routes';
import DashiconsGroups from '~icons/dashicons/groups';
import IwwaArrowDown from '~icons/iwwa/arrow-down';

type GroupSelectorProps = {
    groupNames: string[];
    selectedGroupName: string;
    organism: string;
};
export const MySequencesGroupSelector: FC<GroupSelectorProps> = ({ groupNames, selectedGroupName, organism }) => {
    const groupNameElement = (
        <>
            <DashiconsGroups className='w-6 h-6 inline-block mr-1 -mt-1' />
            <span className='text-gray-700'>{selectedGroupName}</span>
        </>
    );

    return (
        <div className='mb-1'>
            {groupNames.length === 1 ? (
                groupNameElement
            ) : (
                <div className='dropdown'>
                    <div tabIndex={0} role='button' className=''>
                        {groupNameElement} <IwwaArrowDown className='inline-block -mt-1 h-5 w-5' />
                    </div>
                    <ul tabIndex={0} className='dropdown-content z-[1] menu p-2 shadow bg-base-100 w-52 text-gray-700'>
                        {groupNames.map((groupName: string) => (
                            <li key={groupName}>
                                <a
                                    onClick={() => {
                                        location.href = routes.mySequencesPage(organism, groupName);
                                    }}
                                >
                                    {groupName}
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};
