import type { FC } from 'react';

import type { SequenceFilter } from '../SearchPage/DownloadDialog/SequenceFilters';
import MaterialSymbolsClose from '~icons/material-symbols/close';

type ActiveFiltersProps = {
    sequenceFilter: SequenceFilter;
    removeFilter?: (key: string) => void;
    removeArrayFilter?: (key: string, value: string) => void;
};

export const ActiveFilters: FC<ActiveFiltersProps> = ({ sequenceFilter, removeFilter, removeArrayFilter }) => {
    if (sequenceFilter.isEmpty()) return null;
    const showXButton = removeFilter !== undefined;

    return (
        <div className='flex flex-row flex-wrap gap-3'>
            {[...sequenceFilter.toDisplayStrings()].map(([key, [label, value]]) => {
                // Check if value is an array (multi-select)
                if (Array.isArray(value)) {
                    return value.map((val, index) => (
                        <div
                            key={`${key}-${index}`}
                            className='border-primary-600 rounded-sm border border-l-primary-600 bg-gray-100 border-l-8 pl-3 py-1 text-sm flex flex-row'
                        >
                            <span className='text-primary-900 font-light pr-1'>{label}:</span>
                            <span className='text-primary-900 font-semibold'>{val}</span>
                            {showXButton && removeArrayFilter ? (
                                <button
                                    aria-label={`remove ${val} filter`}
                                    className='inline ml-2 mt-0.5 pr-2'
                                    onClick={() => removeArrayFilter(key, val)}
                                >
                                    <MaterialSymbolsClose className='w-3 h-4 text-primary-600' />
                                </button>
                            ) : (
                                <div className='pr-4'></div>
                            )}
                        </div>
                    ));
                }

                // Single value rendering (original behavior)
                return (
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
                                <MaterialSymbolsClose className='w-3 h-4 text-primary-600' />
                            </button>
                        ) : (
                            <div className='pr-4'></div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
