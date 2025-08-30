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
        <div className='flex flex-row flex-wrap gap-3'>
            {[...sequenceFilter.toDisplayStrings()].map(([key, [label, value]]) => (
                <div
                    key={key}
                    className='border-primary-600 rounded-sm border border-l-primary-600 bg-gray-100 border-l-8 pl-3 py-1 text-sm flex flex-row'
                >
                    <span className='text-primary-900 font-light pr-1'>{label}:</span>
                    {value === '' ? (
                        <span className='text-primary-900 italic'>any</span>
                    ) : value === null ? (
                        <span className='text-primary-900 italic'>(blank)</span>
                    ) : (
                        <span className='text-primary-900 font-semibold'>{value}</span>
                    )}
                    {showXButton ? (
                        <button
                            aria-label='remove filter'
                            className='inline ml-2 mt-0.5 pr-2'
                            onClick={() => removeFilter(key)}
                        >
                            <svg className='w-3 h-4 text-primary-600' fill='currentColor' viewBox='0 0 20 20'>
                                <path
                                    fillRule='evenodd'
                                    d='M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z'
                                    clipRule='evenodd'
                                />
                            </svg>
                        </button>
                    ) : (
                        <div className='pr-4'></div>
                    )}
                </div>
            ))}
        </div>
    );
};
