import type { FC } from 'react';

import type { SequenceFilter } from '../SearchPage/DownloadDialog/SequenceFilters';

type ActiveFiltersProps = {
    sequenceFilter: SequenceFilter;
};

export const ActiveFilters: FC<ActiveFiltersProps> = ({ sequenceFilter: downloadParameters }) => {
    if (downloadParameters.isEmpty()) return null;

    return (
        <div className='mb-4'>
            <h4 className='font-bold mb-2'>Active filters</h4>
            <div className='flex flex-row flex-wrap gap-4'>
                {[...downloadParameters.toDisplayStrings()].map(([key, desc]) => (
                    <div key={key} className='border-black border rounded-full px-2 py-1 text-sm'>
                        {desc}
                    </div>
                ))}
            </div>
        </div>
    );
};
