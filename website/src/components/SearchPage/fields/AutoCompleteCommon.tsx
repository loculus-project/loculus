import { useEffect, useMemo, type ReactNode } from 'react';

import { createOptionsProviderHook, type Option, type OptionsProvider } from './AutoCompleteOptions.ts';
import { getClientLogger } from '../../../clientLogger.ts';
import { formatNumberWithDefaultLocale } from '../../../utils/formatNumber.tsx';
import { ComboboxOption, ComboboxOptions } from '../../common/headlessui/Combobox';
import MdiTick from '~icons/mdi/tick';

const logger = getClientLogger('AutoCompleteField');

/**
 * Custom hook that provides filtered options for autocomplete fields.
 * Handles loading, error logging, and filtering based on query.
 */
export const useAutoCompleteOptions = (
    optionsProvider: OptionsProvider,
    query: string,
    maxDisplayedOptions: number = 1000,
) => {
    const hook = createOptionsProviderHook(optionsProvider);
    const { options, isPending, error, load } = hook();

    useEffect(() => {
        if (error) {
            void logger.error(`Error while loading autocomplete options: ${error.message} - ${error.stack}`);
        }
    }, [error]);

    const filteredOptions = useMemo(() => {
        const allMatchedOptions =
            query === ''
                ? options
                : options.filter((option) => option.option.toLowerCase().includes(query.toLowerCase()));
        return allMatchedOptions.slice(0, maxDisplayedOptions);
    }, [options, query, maxDisplayedOptions]);

    return { filteredOptions, isPending, load };
};

type AutoCompleteOptionItemProps = {
    option: Option;
};

/**
 * Renders a single option in the autocomplete dropdown with count and selection indicator.
 */
export const AutoCompleteOptionItem = ({ option }: AutoCompleteOptionItemProps) => {
    return (
        <ComboboxOption
            key={option.option}
            className={({ focus }) =>
                `relative cursor-default select-none py-2 pl-10 pr-4 ${
                    focus ? 'bg-blue-500 text-white' : 'text-gray-900'
                }`
            }
            value={option.value}
        >
            {({ focus, selected }) => (
                <>
                    <span
                        className={`inline-block ${selected ? 'font-medium' : 'font-normal'} ${
                            option.option === '(blank)' ? 'italic' : ''
                        }`}
                    >
                        {option.option}
                    </span>
                    {option.count !== undefined && (
                        <span className='inline-block ml-1'>({formatNumberWithDefaultLocale(option.count)})</span>
                    )}
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
    );
};

type AutoCompleteDropdownProps = {
    isPending: boolean;
    filteredOptions: Option[];
    headerContent?: ReactNode;
};

const DROPDOWN_CLASS =
    'absolute z-20 w-full py-1 mt-1 overflow-auto text-base bg-white rounded-md shadow-lg max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm min-h-32';

/**
 * Renders the autocomplete dropdown with loading state, empty state, and options list.
 */
export const AutoCompleteDropdown = ({ isPending, filteredOptions, headerContent }: AutoCompleteDropdownProps) => {
    return (
        <ComboboxOptions modal={false} className={DROPDOWN_CLASS}>
            {isPending ? (
                <div className='px-4 py-2 text-gray-500'>Loading...</div>
            ) : filteredOptions.length === 0 ? (
                <div className='px-4 py-2 text-gray-500'>No options available</div>
            ) : (
                <>
                    {headerContent}
                    {filteredOptions.map((option) => (
                        <AutoCompleteOptionItem key={option.option} option={option} />
                    ))}
                </>
            )}
        </ComboboxOptions>
    );
};
