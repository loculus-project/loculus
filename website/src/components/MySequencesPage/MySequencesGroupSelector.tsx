import { type FC } from 'react';

import { routes } from '../../routes/routes';
import IwwaArrowDown from '~icons/iwwa/arrow-down';

type GroupSelectorProps = {
    groupNames: string[];
    selectedGroupName: string;
    organism: string;
};
export const MySequencesGroupSelector: FC<GroupSelectorProps> = ({ groupNames, selectedGroupName, organism }) => {
    if (groupNames.length === 1) {
        return <span className='text-yellow-600'>{selectedGroupName}</span>;
    }

    return (
        <div className='dropdown'>
            <div tabIndex={0} role='button' className='text-yellow-600'>
                {selectedGroupName} <IwwaArrowDown className='inline-block -mt-1 -ml-1 h-6 w-6' />
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
    );
};
