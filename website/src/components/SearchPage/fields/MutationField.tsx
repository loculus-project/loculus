import { Combobox, Transition } from '@headlessui/react';
import { type FC, Fragment, useMemo, useState } from 'react';
import * as React from 'react';

import type { MutationFilter } from '../../../types/config.ts';
import type { ReferenceGenomesSequenceNames } from '../../../types/referencesGenomes.ts';
import type { BaseType } from '../../../utils/sequenceTypeHelpers.ts';

interface MutationFieldProps {
    referenceGenomes: ReferenceGenomesSequenceNames;
    value: MutationFilter;
    onChange: (mutationFilter: MutationFilter) => void;
}

export const MutationField: FC<MutationFieldProps> = ({ referenceGenomes, value, onChange }) => {
    const [options, setOptions] = useState<MutationQuery[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [hasFocus, setHasFocus] = useState(false);

    const selectedOptions: MutationQuery[] = useMemo(() => {
        const mappers = [
            { from: value.nucleotideMutationQueries, baseType: 'nucleotide', mutationType: 'substitutionOrDeletion' },
            { from: value.aminoAcidMutationQueries, baseType: 'aminoAcid', mutationType: 'substitutionOrDeletion' },
            { from: value.nucleotideInsertionQueries, baseType: 'nucleotide', mutationType: 'insertion' },
            { from: value.aminoAcidInsertionQueries, baseType: 'aminoAcid', mutationType: 'insertion' },
        ] as const;
        return mappers
            .map(({ from, baseType, mutationType }) => from?.map((text) => ({ baseType, mutationType, text })) ?? [])
            .flat();
    }, [value]);

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = event.target.value;
        setInputValue(newValue);
        const newOptions: MutationQuery[] = [];
        const tests = [
            { baseType: 'nucleotide', mutationType: 'substitutionOrDeletion', test: isValidNucleotideMutationQuery },
            { baseType: 'aminoAcid', mutationType: 'substitutionOrDeletion', test: isValidAminoAcidMutationQuery },
            { baseType: 'nucleotide', mutationType: 'insertion', test: isValidNucleotideInsertionQuery },
            { baseType: 'aminoAcid', mutationType: 'insertion', test: isValidAminoAcidInsertionQuery },
        ] as const;
        tests.forEach(({ baseType, mutationType, test }) => {
            if (test(newValue, referenceGenomes)) {
                newOptions.push({ baseType, mutationType, text: newValue });
            }
        });
        setOptions(newOptions);
    };

    const handleOptionClick = (option: MutationQuery[] | MutationQuery) => {
        if (Array.isArray(option)) {
            option = option[0];
        }
        const newSelectedOptions = [...selectedOptions, option];
        const mutationFilter: Required<MutationFilter> = {
            nucleotideMutationQueries: [],
            aminoAcidMutationQueries: [],
            nucleotideInsertionQueries: [],
            aminoAcidInsertionQueries: [],
        };
        const mappers = [
            {
                to: mutationFilter.nucleotideMutationQueries,
                baseType: 'nucleotide',
                mutationType: 'substitutionOrDeletion',
            },
            {
                to: mutationFilter.aminoAcidMutationQueries,
                baseType: 'aminoAcid',
                mutationType: 'substitutionOrDeletion',
            },
            { to: mutationFilter.nucleotideInsertionQueries, baseType: 'nucleotide', mutationType: 'insertion' },
            { to: mutationFilter.aminoAcidInsertionQueries, baseType: 'aminoAcid', mutationType: 'insertion' },
        ] as const;
        for (const { baseType, mutationType, text } of newSelectedOptions) {
            mappers.forEach((mapper) => {
                if (baseType === mapper.baseType && mutationType === mapper.mutationType) {
                    mapper.to.push(text);
                }
            });
        }
        onChange(mutationFilter);
        setInputValue('');
        setOptions([]);
    };

    const handleTagDelete = (index: number) => {
        const newSelectedOptions = selectedOptions.filter((_, i) => i !== index);
        const mutationFilter: Required<MutationFilter> = {
            nucleotideMutationQueries: [],
            aminoAcidMutationQueries: [],
            nucleotideInsertionQueries: [],
            aminoAcidInsertionQueries: [],
        };
        const mappers = [
            {
                to: mutationFilter.nucleotideMutationQueries,
                baseType: 'nucleotide',
                mutationType: 'substitutionOrDeletion',
            },
            {
                to: mutationFilter.aminoAcidMutationQueries,
                baseType: 'aminoAcid',
                mutationType: 'substitutionOrDeletion',
            },
            { to: mutationFilter.nucleotideInsertionQueries, baseType: 'nucleotide', mutationType: 'insertion' },
            { to: mutationFilter.aminoAcidInsertionQueries, baseType: 'aminoAcid', mutationType: 'insertion' },
        ] as const;
        for (const { baseType, mutationType, text } of newSelectedOptions) {
            mappers.forEach((mapper) => {
                if (baseType === mapper.baseType && mutationType === mapper.mutationType) {
                    mapper.to.push(text);
                }
            });
        }
        onChange(mutationFilter);
    };

    return (
        <div className='relative mt-1 mb-2'>
            <Combobox value={selectedOptions} onChange={handleOptionClick}>
                <div className='relative mt-1'>
                    <div
                        className={`w-full flex flex-wrap items-center border border-gray-300 bg-white rounded-md shadow-sm text-left cursor-default focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500 sm:text-sm
            ${selectedOptions.length === 0 ? '' : 'pt-2 pl-2'}
            `}
                    >
                        {selectedOptions.map((option, index) => (
                            <span
                                key={index}
                                className={`inline-block mr-2 px-2 py-1 rounded-full text-sm ${
                                    option.baseType === 'nucleotide'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-green-100 text-green-800'
                                }`}
                            >
                                {option.text}
                                <button
                                    type='button'
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        handleTagDelete(index);
                                    }}
                                    className='ml-1 focus:outline-none'
                                >
                                    &times;
                                </button>
                            </span>
                        ))}
                        <label
                            htmlFor='mutField'
                            className={` ${
                                hasFocus || selectedOptions.length > 0 ? '' : 'hidden'
                            } absolute text-sm text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-3 scale-75 top-1 z-10 origin-[0] bg-white dark:bg-gray-900 px-2 peer-focus:px-2 peer-focus:text-blue-600 peer-focus:dark:text-blue-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-1 peer-focus:scale-75 peer-focus:-translate-y-3 start-1 rtl:peer-focus:translate-x-1/4 rtl:peer-focus:left-auto`}
                        >
                            Mutations
                        </label>
                        <Combobox.Input
                            onFocus={() => setHasFocus(true)}
                            onBlur={() => setHasFocus(false)}
                            placeholder={hasFocus ? '' : selectedOptions.length === 0 ? 'Mutations' : 'Enter mutation'}
                            onChange={handleInputChange}
                            displayValue={(option: MutationQuery) => option.text}
                            value={inputValue}
                            id='mutField'
                            className={`
                        block w-full text-sm text-gray-900 bg-transparent  focus:outline-none focus:ring-0 
                        ${selectedOptions.length === 0 ? 'border-0 focus:border-0 py-3' : 'border border-gray-300 border-solid m-2 text-sm ml-0'}
                     `}
                        />
                    </div>
                    <Transition
                        as={Fragment}
                        leave='transition ease-in duration-100'
                        leaveFrom='opacity-100'
                        leaveTo='opacity-0'
                    >
                        <Combobox.Options className='absolute w-full z-20 py-1 mt-1 overflow-auto text-base bg-white rounded-md shadow-lg max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm'>
                            {options.map((option, index) => (
                                <Combobox.Option
                                    key={index}
                                    value={option}
                                    className={({ active }) =>
                                        `${active ? 'text-white bg-blue-600' : 'text-gray-900'} cursor-default select-none relative py-2 pl-10 pr-4`
                                    }
                                >
                                    {({ selected }) => (
                                        <span className={`${selected ? 'font-medium' : 'font-normal'} block truncate`}>
                                            {option.text}
                                        </span>
                                    )}
                                </Combobox.Option>
                            ))}
                        </Combobox.Options>
                    </Transition>
                </div>
            </Combobox>
        </div>
    );
};
type MutationQuery = {
    baseType: BaseType;
    mutationType: 'substitutionOrDeletion' | 'insertion';
    text: string;
};

const isValidNucleotideMutationQuery = (text: string, referenceGenomes: ReferenceGenomesSequenceNames): boolean => {
    try {
        const isMultiSegmented = referenceGenomes.nucleotideSequences.length > 1;
        const textUpper = text.toUpperCase();
        let mutation = textUpper;
        if (isMultiSegmented) {
            const [segment, _mutation] = textUpper.split(':');
            const existingSegments = new Set(referenceGenomes.nucleotideSequences.map((n) => n.toUpperCase()));
            if (!existingSegments.has(segment)) {
                return false;
            }
            mutation = _mutation;
        }
        return /^[A-Z]?[0-9]+[A-Z-\\.]?$/.test(mutation);
    } catch (_) {
        return false;
    }
};

const isValidAminoAcidMutationQuery = (text: string, referenceGenomes: ReferenceGenomesSequenceNames): boolean => {
    try {
        const textUpper = text.toUpperCase();
        const [gene, mutation] = textUpper.split(':');
        const existingGenes = new Set(referenceGenomes.genes.map((g) => g.toUpperCase()));
        if (!existingGenes.has(gene)) {
            return false;
        }
        return /^[A-Z*]?[0-9]+[A-Z-*\\.]?$/.test(mutation);
    } catch (_) {
        return false;
    }
};

const isValidNucleotideInsertionQuery = (text: string, referenceGenomes: ReferenceGenomesSequenceNames): boolean => {
    try {
        const isMultiSegmented = referenceGenomes.nucleotideSequences.length > 1;
        const textUpper = text.toUpperCase();
        if (!textUpper.startsWith('INS_')) {
            return false;
        }
        const query = textUpper.slice(4);
        const split = query.split(':');
        const [segment, position, insertion] = isMultiSegmented
            ? split
            : ([undefined, ...split] as [undefined | string, string, string]);
        if (segment !== undefined) {
            const existingSegments = new Set(referenceGenomes.nucleotideSequences.map((n) => n.toUpperCase()));
            if (!existingSegments.has(segment)) {
                return false;
            }
        }
        if (!Number.isInteger(Number(position))) {
            return false;
        }
        return /^[A-Z*?]+$/.test(insertion);
    } catch (_) {
        return false;
    }
};

const isValidAminoAcidInsertionQuery = (text: string, referenceGenomes: ReferenceGenomesSequenceNames): boolean => {
    try {
        const textUpper = text.toUpperCase();
        if (!textUpper.startsWith('INS_')) {
            return false;
        }
        const query = textUpper.slice(4);
        const [gene, position, insertion] = query.split(':');
        const existingGenes = new Set(referenceGenomes.genes.map((g) => g.toUpperCase()));
        if (!existingGenes.has(gene) || !Number.isInteger(Number(position))) {
            return false;
        }
        return /^[A-Z*?]+$/.test(insertion);
    } catch (_) {
        return false;
    }
};
