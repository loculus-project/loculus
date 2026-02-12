import { type FC, useEffect, useId, useMemo, useState } from 'react';

import type { LapisSearchParameters } from './DownloadDialog/SequenceFilters.tsx';
import { createOptionsProviderHook, type OptionsProvider } from './fields/AutoCompleteOptions.ts';
import { type ReferenceGenomesInfo } from '../../types/referencesGenomes.ts';
import { formatNumberWithDefaultLocale } from '../../utils/formatNumber.tsx';
import { getReferenceIdentifier } from '../../utils/referenceSelection.ts';
import { NULL_QUERY_VALUE, type MetadataFilterSchema } from '../../utils/search.ts';
import { segmentsWithMultipleReferences, type SegmentReferenceSelections } from '../../utils/sequenceTypeHelpers.ts';
import { Button } from '../common/Button.tsx';
import MaterialSymbolsClose from '~icons/material-symbols/close';
import { getClientLogger } from '../../clientLogger.ts';
import {
    Combobox,
    ComboboxButton,
    ComboboxInput,
    ComboboxOption,
    ComboboxOptions,
} from '../common/headlessui/Combobox.tsx';
import MdiChevronUpDown from '~icons/mdi/chevron-up-down';
import MdiTick from '~icons/mdi/tick';

const logger = getClientLogger('SingleChoiceAutoCompleteField');

type SegmentReferenceSelectorProps = {
    selectId: string;
    label: string | undefined;
    value: string | null | undefined;
    onChange: (next: string) => void;
    onClear: () => void;
    optionsProvider: OptionsProvider;
    maxDisplayedOptions?: number;
};

const SegmentReferenceSelector: FC<SegmentReferenceSelectorProps> = ({
    selectId,
    label,
    value,
    onChange,
    onClear,
    optionsProvider,
    maxDisplayedOptions = 1000,
}) => {
    const [query, setQuery] = useState('');

    const hook = createOptionsProviderHook(optionsProvider);
    const { options, isPending, error, load } = hook();

    useEffect(() => {
        if (error) {
            void logger.error(`Error while loading segment reference options: ${error.message} - ${error.stack}`);
        }
    }, [error]);

    const filteredOptions = useMemo(() => {
        const allMatchedOptions =
            query === ''
                ? options
                : options.filter((option) => option.option.toLowerCase().includes(query.toLowerCase()));
        return allMatchedOptions.slice(0, maxDisplayedOptions);
    }, [options, query, maxDisplayedOptions]);

    const displayForOption = (opt: { option: string; count?: number }) =>
        opt.count !== undefined ? `${opt.option} (${formatNumberWithDefaultLocale(opt.count)})` : opt.option;

    const handleChange = (next: string) => {
        onChange(next);
        setQuery('');
    };

    const handleClear = () => {
        onClear();
        setQuery('');
    }

    const selectedValue = value ?? '';

    return (
        <Combobox value={selectedValue} onChange={handleChange} immediate>
            <div className='relative'>
                <ComboboxInput
                    id={selectId}
                    displayValue={(value: string | number | null) => {
                        if (value === null || value === NULL_QUERY_VALUE) {
                            return '(blank)';
                        }
                        return String(value);
                    }}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={load}
                    placeholder={`Select ${formatLabel(label ?? '')}...`}
                    className='w-full px-2 py-1.5 rounded border border-gray-300 text-sm bg-white focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-200'
                />

                {selectedValue !== '' && (
                    <Button
                        className='absolute top-2 right-8 flex items-center pr-2 h-5 bg-white rounded-sm'
                        onClick={handleClear}
                        aria-label={`Clear ${label ?? ''}`}
                        type='button'
                    >
                        <MaterialSymbolsClose className='w-5 h-5 text-gray-400' />
                    </Button>
                )}

                <ComboboxButton className='absolute inset-y-0 right-0 flex items-center pr-2'>
                    <MdiChevronUpDown className='w-5 h-5 text-gray-400' />
                </ComboboxButton>

                <ComboboxOptions
                    modal={false}
                    className='absolute z-20 w-full py-1 mt-1 overflow-auto text-base bg-white rounded-md shadow-lg max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm'
                >
                    {isPending ? (
                        <div className='px-4 py-2 text-gray-500'>Loading...</div>
                    ) : error ? (
                        <div className='px-4 py-2 text-gray-500'>Failed to load options</div>
                    ) : filteredOptions.length === 0 ? (
                        <div className='px-4 py-2 text-gray-500'>No options available</div>
                    ) : (
                        filteredOptions.map((opt) => (
                            <ComboboxOption
                                key={String(opt.value)}
                                value={String(opt.value)}
                                className={({ focus }) =>
                                    `relative cursor-default select-none py-2 pl-10 pr-4 ${
                                        focus ? 'bg-blue-500 text-white' : 'text-gray-900'
                                    }`
                                }
                            >
                                {({ focus, selected }) => (
                                    <>
                                        <span className={`inline-block ${selected ? 'font-medium' : 'font-normal'}`}>
                                            {displayForOption(opt)}
                                        </span>

                                        {selected && (
                                            <span
                                                className={`absolute inset-y-0 left-0 flex items-center pl-3 ${
                                                    focus ? 'text-white' : 'text-blue-500'
                                                }`}
                                            >
                                                <MdiTick className='w-5 h-5' />
                                            </span>
                                        )}
                                    </>
                                )}
                            </ComboboxOption>
                        ))
                    )}
                </ComboboxOptions>
            </div>
        </Combobox>
    );
};

type ReferenceSelectorProps = {
    lapisSearchParameters: LapisSearchParameters;
    lapisUrl: string;
    filterSchema: MetadataFilterSchema;
    referenceGenomesInfo: ReferenceGenomesInfo;
    referenceIdentifierField: string;
    selectedReferences: SegmentReferenceSelections;
    setSelectedReferences: (newValues: SegmentReferenceSelections) => void;
};

export const ReferenceSelector: FC<ReferenceSelectorProps> = ({
    lapisSearchParameters,
    lapisUrl,
    filterSchema,
    referenceGenomesInfo,
    referenceIdentifierField,
    selectedReferences,
    setSelectedReferences,
}) => {
    const baseSelectId = useId();

    const multiRefSegments = segmentsWithMultipleReferences(referenceGenomesInfo);
    if (multiRefSegments.length === 0) return null;
    const identifierBySegment = useMemo(() => {
        return multiRefSegments.reduce<Record<string, string | undefined>>((acc, segmentName) => {
            const identifier = getReferenceIdentifier(
                referenceIdentifierField,
                segmentName,
                referenceGenomesInfo.isMultiSegmented,
            );

            acc[segmentName] = identifier;

            return acc;
        }, {});
    }, [referenceIdentifierField, referenceGenomesInfo]);
    const labelsBySegment = useMemo(() => {
        return multiRefSegments.reduce<Record<string, string | undefined>>((acc, segmentName) => {
            const identifier = identifierBySegment[segmentName];

            acc[segmentName] = identifier ? filterSchema.filterNameToLabelMap()[identifier] : undefined;

            return acc;
        }, {});
    }, [filterSchema, referenceIdentifierField, referenceGenomesInfo]);

    const optionsProvidersBySegment = useMemo(() => {
        return multiRefSegments.reduce<Record<string, OptionsProvider>>((acc, segment) => {
            const identifier = identifierBySegment[segment];
            if (!identifier) return acc;

            acc[segment] = {
                type: 'generic' as const,
                lapisUrl,
                lapisSearchParameters,
                fieldName: identifier,
            };

            return acc;
        }, {});
    }, [multiRefSegments, identifierBySegment, lapisUrl, lapisSearchParameters]);

    return (
        <>
            {multiRefSegments.map((segment) => {
                return (
                    <div className='bg-gray-50 border border-gray-300 rounded-md p-3 mb-3'>
                        <label
                            className='block text-xs font-semibold text-gray-700 mb-1'
                            htmlFor={`${baseSelectId}-${segment}`}
                        >
                            {labelsBySegment[segment]}
                        </label>
                        <SegmentReferenceSelector
                            key={segment}
                            label={labelsBySegment[segment]}
                            selectId={`${baseSelectId}-${segment}`}
                            value={selectedReferences[segment]}
                            onChange={(e) =>
                                setSelectedReferences({
                                    ...selectedReferences,
                                    [segment]: e,
                                })
                            }
                            onClear={() =>
                                setSelectedReferences({
                                    ...selectedReferences,
                                    [segment]: null,
                                })
                            }
                            optionsProvider={optionsProvidersBySegment[segment]}
                        />
                        <p className='text-xs text-gray-600 mt-2'>
                            Select a {formatLabel(labelsBySegment[segment] ?? '')} to enable mutation search and
                            download of aligned sequences
                        </p>
                    </div>
                );
            })}
        </>
    );
};

export const formatLabel = (label: string) => {
    if (label === label.toUpperCase()) {
        return label; // all caps, keep as is
    }
    return label.charAt(0).toLowerCase() + label.slice(1);
};
