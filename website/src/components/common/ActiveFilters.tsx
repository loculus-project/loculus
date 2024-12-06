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
            <div className='flex flex-row flex-wrap gap-3'>
                {[...downloadParameters.toDisplayStrings()].map(([key, desc]) => (
                    <div key={key} className='border-primary-600 rounded-sm border border-l-primary-600 bg-gray-100 text-primary-900 border-l-8 px-3 py-1 text-sm font-semibold'>
                        {desc}
                    </div>
                ))}
            </div>
        </div>
    );
};
