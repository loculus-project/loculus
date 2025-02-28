import type { FC } from 'react';

import type { SequenceFilter } from '../SearchPage/DownloadDialog/SequenceFilters';

type ActiveFiltersProps = {
    sequenceFilter: SequenceFilter;
    removeFilter?: (key: string) => void;
};

export const ActiveFilters: FC<ActiveFiltersProps> = ({ sequenceFilter, removeFilter }) => {
    if (sequenceFilter.isEmpty()) return null;
    const showXButton = removeFilter !== undefined;

    return (
        <div className='mb-4'>
            <h4 className='font-bold mb-2'>Active filters</h4>
            <div className='flex flex-row flex-wrap gap-3'>
                {[...sequenceFilter.toDisplayStrings()].map(([key, [label, value]]) => (
                    <div
                        key={key}
                        className='border-primary-600 rounded-sm border border-l-primary-600 bg-gray-100 border-l-8 px-3 py-1 text-sm'
                    >
                        <span className='text-primary-900 font-light pr-1'>{label}:</span>
                        <span className='text-primary-900 font-semibold'>{value}</span>
                        {showXButton && (
                            <button onClick={() => removeFilter(key)}>
                                X
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
