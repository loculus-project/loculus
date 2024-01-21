import { Autocomplete, Box, Chip, TextField } from '@mui/material';
import { type FC, useMemo, useState } from 'react';
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

    const handleInputChange = (_: React.SyntheticEvent, newValue: string) => {
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

    const handleChange = (_: React.SyntheticEvent, newValue: MutationQuery[]) => {
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
        for (const { baseType, mutationType, text } of newValue) {
            mappers.forEach((mapper) => {
                if (baseType === mapper.baseType && mutationType === mapper.mutationType) {
                    mapper.to.push(text);
                }
            });
        }
        onChange(mutationFilter);
    };

    return (
        <Autocomplete
            multiple
            value={selectedOptions}
            renderInput={(params) => (
                <TextField {...params} label='Mutations' margin='dense' size='small' className='w-60' />
            )}
            options={options}
            onChange={handleChange}
            onInputChange={handleInputChange}
            renderOption={(props, option) => (
                <Box component='li' {...props}>
                    {option.text}
                </Box>
            )}
            renderTags={(values, getTagProps) => {
                return values.map((option, index) => (
                    <Chip
                        {...getTagProps({ index })}
                        label={option.text}
                        variant='outlined'
                        color={option.baseType === 'nucleotide' ? 'primary' : 'success'}
                    />
                ));
            }}
            getOptionLabel={(option) => option.text}
            filterOptions={(x) => x}
            autoHighlight
        />
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
