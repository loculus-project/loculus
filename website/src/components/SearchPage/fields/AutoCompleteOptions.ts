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
    lapisSearchParameters: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- TODO(#3451)
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

const createLineageOptionsHook = (
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
        const {
            data,
            isLoading: aggregateIsLoading,
            error: aggregateError,
            mutate,
        } = lapisClientHooks(lapisUrl).zodiosHooks.useAggregated({}, {});

        const {
            data: lineageDefinition,
            isLoading: defIsLoading,
            error: defError,
        } = lapisClientHooks(lapisUrl).zodiosHooks.useLineageDefinition(
            {
                params: {
                    column: fieldName,
                },
            },
            {},
        );

        const counts = new Map<string, number>();

        // set initial counts
        if (data?.data) {
            data.data
                .filter(
                    (it) =>
                        typeof it[fieldName] === 'string' ||
                        typeof it[fieldName] === 'boolean' ||
                        typeof it[fieldName] === 'number',
                )
                .forEach((it) => counts.set(it[fieldName]!.toString(), it.count));
        }

        const options: Option[] = [];

        if (lineageDefinition) {
            // sum up counts for all aliases
            Object.entries(lineageDefinition).forEach(([lineageName, { aliases }]) => {
                if (aliases) {
                    aliases.forEach((alias) => {
                        const aliasCount = counts.get(alias) ?? 0;
                        const lineageCount = counts.get(lineageName) ?? 0;
                        counts.set(lineageName, lineageCount + aliasCount);
                        counts.delete(alias);
                    });
                }
            });

            // generate options
            Object.entries(lineageDefinition).forEach(([lineageName, { aliases }]) => {
                let count: number | undefined = counts.get(lineageName);
                if (count === 0) count = undefined;
                options.push({ option: lineageName, count });
                if (aliases) {
                    aliases.forEach((alias) => options.push({ option: alias, count }));
                }
            });
        }

        options.sort((a, b) => (a.option.toLowerCase() < b.option.toLowerCase() ? -1 : 1));

        return {
            options,
            isLoading: aggregateIsLoading || defIsLoading,
            error: new AggregateError([aggregateError, defError]),
            load: () => mutate(lapisParams),
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
            return useCallback(
                createLineageOptionsHook(
                    optionsProvider.lapisUrl,
                    optionsProvider.fieldName,
                    optionsProvider.lapisSearchParameters,
                ),
                [optionsProvider],
            );
    }
};
