import { useCallback } from 'react';

import { lapisClientHooks } from '../../../services/serviceHooks.ts';

export type Option = {
    option: string;
    count: number | undefined;
};

/* Fetch options as all possible unique values for `fieldName` */
type GenericOptionsProvider = {
    type: 'generic';
    lapisUrl: string;
    lapisSearchParameters: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- TODO(#3451)
    fieldName: string;
};

/* Fetch options from the lineage definition for `fieldName` */
type LineageOptionsProvider = {
    type: 'lineage';
    lapisUrl: string;
    fieldName: string;
};

/* Defines where how the options in the dropdown of the AutocompleteField are fetched. */
export type OptionsProvider = GenericOptionsProvider | LineageOptionsProvider;

export type AutocompleteOptionsHook = () => {
    options: Option[];
    isLoading: boolean;
    error: Error | null;
    load: () => void;
};

const createGenericOptionsHook = (
    lapisUrl: string,
    fieldName: string,
    lapisSearchParameters: Record<string, any>, // eslint-disable-line @typescript-eslint/no-explicit-any -- TODO(#3451) use a proper type
): AutocompleteOptionsHook => {
    const otherFields = { ...lapisSearchParameters };
    delete otherFields[fieldName];

    Object.keys(otherFields).forEach((key) => {
        if (otherFields[key] === '') {
            delete otherFields[key];
        }
    });

    const lapisParams = { fields: [fieldName], ...otherFields };

    return function hook() {
        const { data, isLoading, error, mutate } = lapisClientHooks(lapisUrl).zodiosHooks.useAggregated({}, {});

        const options: Option[] = (data?.data ?? [])
            .filter(
                (it) =>
                    typeof it[fieldName] === 'string' ||
                    typeof it[fieldName] === 'boolean' ||
                    typeof it[fieldName] === 'number',
            )
            .map((it) => ({ option: it[fieldName]!.toString(), count: it.count }))
            .sort((a, b) => (a.option.toLowerCase() < b.option.toLowerCase() ? -1 : 1));

        return {
            options,
            isLoading,
            error,
            load: () => mutate(lapisParams),
        };
    };
};

const createLineageOptionsHook = (lapisUrl: string, fieldName: string): AutocompleteOptionsHook => {
    return function hook() {
        const {
            data: lineageDefinition,
            isLoading,
            error,
        } = lapisClientHooks(lapisUrl).zodiosHooks.useLineageDefinition(
            {
                params: {
                    column: fieldName,
                },
            },
            {},
        );

        const lineages: string[] = [];

        if (lineageDefinition) {
            Object.entries(lineageDefinition).forEach(([lineageName, lineageEntry]) => {
                lineages.push(lineageName);
                if (lineageEntry.aliases) {
                    lineageEntry.aliases.forEach((alias) => lineages.push(alias));
                }
            });
        }

        const options: Option[] = new Array(...new Set(lineages)).map((lineage) => ({
            option: lineage,
            count: undefined,
        }));

        return {
            options,
            isLoading,
            error,
            load: () => {},
        };
    };
};

export const createOptionsProviderHook = (optionsProvider: OptionsProvider): AutocompleteOptionsHook => {
    switch (optionsProvider.type) {
        case 'generic': {
            return useCallback(
                createGenericOptionsHook(
                    optionsProvider.lapisUrl,
                    optionsProvider.fieldName,
                    optionsProvider.lapisSearchParameters,
                ),
                [optionsProvider],
            );
        }
        case 'lineage':
            return useCallback(createLineageOptionsHook(optionsProvider.lapisUrl, optionsProvider.fieldName), [
                optionsProvider,
            ]);
    }
};
