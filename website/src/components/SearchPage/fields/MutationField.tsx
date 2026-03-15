import { Transition } from '@headlessui/react';
import { type ChangeEvent, type FC, Fragment, useMemo, useState } from 'react';

import { FloatingLabelContainer } from './FloatingLabelContainer.tsx';
import {
    type MutationQuery,
    parseMutationsString,
    parseMutationString,
    serializeMutationQueries,
} from '../../../utils/mutation.ts';
import type { SingleSegmentAndGeneInfo } from '../../../utils/sequenceTypeHelpers.ts';
import { Button } from '../../common/Button';
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from '../../common/headlessui/Combobox';
import DisplaySearchDocs from '../DisplaySearchDocs';

interface MutationFieldProps {
    singleSegmentAndGeneInfo: SingleSegmentAndGeneInfo;
    value: string;
    onChange: (mutationFilter: string) => void;
}

export const MutationField: FC<MutationFieldProps> = ({ singleSegmentAndGeneInfo, value, onChange }) => {
    const [options, setOptions] = useState<MutationQuery[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [hasFocus, setHasFocus] = useState(false);

    const selectedOptions = useMemo(
        () => parseMutationsString(value, singleSegmentAndGeneInfo),
        [value, singleSegmentAndGeneInfo],
    );

    const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
        const newValue = event.target.value;
        setInputValue(newValue);
        const mutQuery = parseMutationString(newValue, singleSegmentAndGeneInfo);
        const newOptions = mutQuery ? [mutQuery] : [];
        setOptions(newOptions);
    };

    const handleOptionClick = (option: MutationQuery[] | MutationQuery | null) => {
        if (Array.isArray(option)) {
            option = option[0];
        }
        // Unclear how to handle null here, necessary since headlessui v2
        if (!option) {
            return;
        }
        const newSelectedOptions = [...selectedOptions, option];
        onChange(serializeMutationQueries(newSelectedOptions));
        setInputValue('');
        setOptions([]);
    };

    const handleTagDelete = (index: number) => {
        const newSelectedOptions = selectedOptions.filter((_, i) => i !== index);
        onChange(serializeMutationQueries(newSelectedOptions));
    };

    const domId = singleSegmentAndGeneInfo.useLapisMultiSegmentedEndpoint
        ? 'mutField_' + singleSegmentAndGeneInfo.nucleotideSegmentInfo.name
        : 'mutField';

    return (
        <div className='flex relative mb-2 flex-row w-full'>
            <Combobox value={selectedOptions} onChange={handleOptionClick}>
                <div className='w-full relative'>
                    <FloatingLabelContainer
                        label='Mutations'
                        isFocused={hasFocus}
                        hasContent={selectedOptions.length > 0 || inputValue !== ''}
                        borderClassName={hasFocus ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-300'}
                        className='shadow-sm'
                        htmlFor={domId}
                    >
                        {selectedOptions.length > 0 && (
                            <div className='flex flex-wrap gap-1 p-1 pt-3'>
                                {selectedOptions.map((option, index) => (
                                    <span
                                        key={index}
                                        className={`inline-block px-2 py-1 rounded-full text-sm ${
                                            option.baseType === 'nucleotide'
                                                ? 'bg-blue-100 text-blue-800'
                                                : 'bg-green-100 text-green-800'
                                        }`}
                                    >
                                        {option.text}
                                        <Button
                                            type='button'
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                handleTagDelete(index);
                                            }}
                                            className='ml-1 focus:outline-none'
                                        >
                                            &times;
                                        </Button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <div className='relative w-full'>
                            <ComboboxInput
                                onFocus={() => setHasFocus(true)}
                                onBlur={() => setHasFocus(false)}
                                placeholder=''
                                onChange={handleInputChange}
                                displayValue={(option: MutationQuery) => option.text}
                                value={inputValue}
                                id={domId}
                                className={`block w-full text-sm text-gray-900 bg-transparent focus:outline-none focus:ring-0 border-0 ${
                                    selectedOptions.length === 0 ? 'px-2.5 pb-1.5 pt-3' : 'px-3 pb-1.5 pt-1'
                                }`}
                            />
                            <div className='absolute top-1/2 -translate-y-1/2 right-1'>
                                <DisplaySearchDocs geneInfos={singleSegmentAndGeneInfo.geneInfos} />
                            </div>
                        </div>
                    </FloatingLabelContainer>
                    <Transition
                        as={Fragment}
                        leave='transition ease-in duration-100'
                        leaveFrom='opacity-100'
                        leaveTo='opacity-0'
                    >
                        <ComboboxOptions
                            modal={false}
                            className='absolute w-full z-20 py-1 mt-1 overflow-auto text-base bg-white rounded-md shadow-lg max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm'
                        >
                            {options.map((option, index) => (
                                <ComboboxOption
                                    key={index}
                                    value={option}
                                    className={({ focus }) =>
                                        `${focus ? 'text-white bg-blue-600' : 'text-gray-900'} cursor-default select-none relative py-2 pl-10 pr-4`
                                    }
                                >
                                    {({ selected }) => (
                                        <span className={`${selected ? 'font-medium' : 'font-normal'} block truncate`}>
                                            {option.text}
                                        </span>
                                    )}
                                </ComboboxOption>
                            ))}
                        </ComboboxOptions>
                    </Transition>
                </div>
            </Combobox>
        </div>
    );
};
