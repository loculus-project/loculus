import { type FC } from 'react';

import { routes } from '../../routes/routes';

type GroupSelectorProps = {
    groupNames: string[];
    selectedGroupName: string;
    organism: string;
};
export const MySequencesGroupSelector: FC<GroupSelectorProps> = ({ groupNames, selectedGroupName, organism }) => {
    return (
        <select
            className='mt-4 select select-bordered'
            onChange={(event) => {
                const newGroup = event.target.value;
                const page = routes.mySequencesPage(organism, newGroup);
                location.href = page;
            }}
        >
            {groupNames.map((groupName: string) => (
                <option selected={groupName === selectedGroupName} value={groupName} key={groupName}>
                    {groupName}
                </option>
            ))}
        </select>
    );
};
