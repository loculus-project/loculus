import { useEffect, useMemo } from 'react';

import { createOptionsProviderHook, type Option, type OptionsProvider } from './AutoCompleteOptions.ts';
import { getClientLogger } from '../../../clientLogger.ts';
import { formatNumberWithDefaultLocale } from '../../../utils/formatNumber.tsx';
import { ComboboxOption, ComboboxOptions } from '../../common/headlessui/Combobox';
import MdiTick from '~icons/mdi/tick';

const logger = getClientLogger('AutoCompleteField');

type UseAutoCompleteOptionsParams = {
    optionsProvider: OptionsProvider;
    query: string;
    maxDisplayedOptions?: number;
};

type UseAutoCompleteOptionsResult = {
    options: Option[];
    filteredOptions: Option[];
    isPending: boolean;
    error: Error | null;
    load: () => void;
};

/**
 * Hook to load and filter autocomplete options with error logging.
 * Shared between SingleChoiceAutoCompleteField and MultiChoiceAutoCompleteField.
 */
export const useAutoCompleteOptions = ({
    optionsProvider,
    query,
    maxDisplayedOptions = 1000,
}: UseAutoCompleteOptionsParams): UseAutoCompleteOptionsResult => {
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

    return { options, filteredOptions, isPending, error, load };
};

type AutoCompleteOptionsListProps = {
    filteredOptions: Option[];
    isPending: boolean;
    headerContent?: React.ReactNode;
};

/**
 * Shared dropdown options list component for autocomplete fields.
 * Renders loading state, empty state, or the list of options.
 */
export const AutoCompleteOptionsList = ({ filteredOptions, isPending, headerContent }: AutoCompleteOptionsListProps) => {
    return (
        <ComboboxOptions
            modal={false}
            className='absolute z-20 w-full py-1 mt-1 overflow-auto text-base bg-white rounded-md shadow-lg max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm min-h-32'
        >
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

type AutoCompleteOptionItemProps = {
    option: Option;
};

/**
 * Individual option item in the autocomplete dropdown.
 */
const AutoCompleteOptionItem = ({ option }: AutoCompleteOptionItemProps) => {
    return (
        <ComboboxOption
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
