import type { FC, ReactElement } from 'react';

import type { SequenceFilter } from '../SearchPage/DownloadDialog/SequenceFilters';
import MaterialSymbolsClose from '~icons/material-symbols/close';

type ActiveFiltersProps = {
    sequenceFilter: SequenceFilter;
    removeFilter?: (key: string) => void;
};

export const ActiveFilters: FC<ActiveFiltersProps> = ({ sequenceFilter, removeFilter }) => {
    if (sequenceFilter.isEmpty()) return null;
    const showXButton = removeFilter !== undefined;

    return (
        <div className='flex flex-row flex-wrap gap-3'>
            {[...sequenceFilter.toDisplayStrings()].map(([key, [label, value]]) => {
                // Check if value is an array (multi-select)
                if (Array.isArray(value)) {
                    // Show as a single badge with first few items and count
                    const displayValues = value.map((v) => v ?? '(blank)');

                    let displayElement: ReactElement;
                    // Show items individually if less than 6, otherwise truncate
                    const SHOW_ALL_THRESHOLD = 6;
                    const MAX_SHOWN = 3;

                    if (displayValues.length === 1) {
                        const val = displayValues[0];
                        displayElement =
                            val === '(blank)' ? (
                                <span className='text-primary-900 italic font-semibold'>{val}</span>
                            ) : (
                                <span className='text-primary-900 font-semibold'>{val}</span>
                            );
                    } else if (displayValues.length < SHOW_ALL_THRESHOLD) {
                        // Show all values if less than threshold
                        displayElement = (
                            <span className='text-primary-900'>
                                {displayValues.map((val, idx) => (
                                    <span key={idx}>
                                        {idx > 0 && ', '}
                                        {val === '(blank)' ? (
                                            <span className='italic font-semibold'>{val}</span>
                                        ) : (
                                            <span className='font-semibold'>{val}</span>
                                        )}
                                    </span>
                                ))}
                            </span>
                        );
                    } else {
                        // Only truncate if we have at least 3 more items
                        const shown = displayValues.slice(0, MAX_SHOWN);
                        const remaining = displayValues.length - MAX_SHOWN;
                        displayElement = (
                            <span className='text-primary-900'>
                                {shown.map((val, idx) => (
                                    <span key={idx}>
                                        {idx > 0 && ', '}
                                        {val === '(blank)' ? (
                                            <span className='italic font-semibold'>{val}</span>
                                        ) : (
                                            <span className='font-semibold'>{val}</span>
                                        )}
                                    </span>
                                ))}
                                <span className='font-semibold'>… and {remaining} more</span>
                            </span>
                        );
                    }

                    return (
                        <div
                            key={key}
                            className='border-primary-600 rounded-sm border border-l-primary-600 bg-gray-100 border-l-8 pl-3 py-1 text-sm flex flex-row'
                        >
                            <span className='text-primary-900 font-light pr-1'>{label}:</span>
                            {displayElement}
                            {showXButton ? (
                                <button
                                    aria-label={`remove ${label} filter`}
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
