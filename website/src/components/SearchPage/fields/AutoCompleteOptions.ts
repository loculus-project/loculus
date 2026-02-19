import { useCallback } from 'react';

import { lapisClientHooks } from '../../../services/serviceHooks.ts';
import type { LineageDefinition } from '../../../types/lapis.ts';
import { NULL_QUERY_VALUE } from '../../../utils/search.ts';
import type { LapisSearchParameters } from '../DownloadDialog/SequenceFilters.tsx';

export type Option = {
    option: string;
    value: string; // Always a string, using NULL_QUERY_VALUE for nulls
    count: number | undefined;
};

/* Fetch options as all possible unique values for `fieldName` */
type GenericOptionsProvider = {
    type: 'generic';
    lapisUrl: string;
    lapisSearchParameters: LapisSearchParameters;
    fieldName: string;
};

/* Fetch options from the lineage definition for `fieldName` */
type LineageOptionsProvider = {
    type: 'lineage';
    lapisUrl: string;
    lapisSearchParameters: LapisSearchParameters;
    fieldName: string;
    includeSublineages: boolean;
};

/* Defines where how the options in the dropdown of the AutocompleteField are fetched. */
export type OptionsProvider = GenericOptionsProvider | LineageOptionsProvider;

export type AutocompleteOptionsHook = () => {
    options: Option[];
    isPending: boolean;
    error: Error | null;
    load: () => void;
};

const createGenericOptionsHook = (
    lapisUrl: string,
    fieldName: string,
    lapisSearchParameters: LapisSearchParameters,
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
        const { data, isPending, error, mutate } = lapisClientHooks(lapisUrl).useAggregated();

        const options: Option[] = (data?.data ?? [])
            .filter(
                (it) =>
                    it[fieldName] === null ||
                    typeof it[fieldName] === 'string' ||
                    typeof it[fieldName] === 'boolean' ||
                    typeof it[fieldName] === 'number',
            )
            .map((it) => ({
                option: it[fieldName] === null ? '(blank)' : it[fieldName].toString(),
                value: it[fieldName] === null ? NULL_QUERY_VALUE : it[fieldName].toString(),
                count: it.count,
            }))
            .sort((a, b) => (a.option.toLowerCase() < b.option.toLowerCase() ? -1 : 1));

        return {
            options,
            isPending,
            error: error instanceof Error ? error : error != null ? new Error(JSON.stringify(error)) : null,
            load: () => mutate(lapisParams),
        };
    };
};

/**
 * A lineage definition is a DAG, and some nodes can have aliases as well.
 * This function aggregates counts for lineages.
 * @param lineageDefinition The lineage definition.
 * @param counts Counts as they occur for lineages or aliases, without any aggregation.
 * @param includeSublineages Whether to aggregate across descendants or not.
 * @returns Counts for all lineages; including only canonical lineage names.
 */
function aggregateCounts(
    lineageDefinition: LineageDefinition,
    counts: Map<string, number>,
    includeSublineages: boolean,
): Map<string, number> {
    // canonical name for every alias
    const canonicalNames = new Map<string, string>();
    // count for every canonical lineage
    const canonicalCounts = new Map<string, number>();

    for (const lineage of Object.keys(lineageDefinition)) {
        canonicalNames.set(lineage, lineage);
        const aliases = lineageDefinition[lineage].aliases ?? [];
        aliases.forEach((a) => canonicalNames.set(a, lineage));
        let count = counts.get(lineage) ?? 0;
        count += aliases.map((a) => counts.get(a) ?? 0).reduce((acc, num) => acc + num, 0);
        canonicalCounts.set(lineage, count);
    }

    let resolvedCounts = new Map<string, number>();

    if (includeSublineages) {
        const children = new Map<string, string[]>();

        // create child map
        for (const lineage of Object.keys(lineageDefinition)) {
            let parents = lineageDefinition[lineage].parents ?? [];
            parents = parents.map((p) => canonicalNames.get(p)!);
            parents.forEach((parent) => {
                const existingChildren = children.get(parent) ?? [];
                children.set(parent, [lineage, ...existingChildren]);
            });
        }

        // traverse tree and collect counts
        for (const lineage of Object.keys(lineageDefinition)) {
            const descendants = new Set<string>();
            let toVisit: string[] = [lineage];
            while (toVisit.length > 0) {
                const currentElement = toVisit[0];
                toVisit = toVisit.slice(1);
                descendants.add(currentElement);
                (children.get(currentElement) ?? []).forEach((child) => toVisit.push(child));
            }
            const count = Array.from(descendants)
                .map((descendant) => canonicalCounts.get(descendant) ?? 0)
                .reduce((acc, num) => acc + num, 0);
            resolvedCounts.set(lineage, count);
        }
    } else {
        resolvedCounts = canonicalCounts;
    }

    return resolvedCounts;
}

const createLineageOptionsHook = (
    lapisUrl: string,
    fieldName: string,
    lapisSearchParameters: LapisSearchParameters,
    includeSublineages: boolean,
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
            isPending: aggregateIsPending,
            error: aggregateError,
            mutate,
        } = lapisClientHooks(lapisUrl).useAggregated();

        const {
            data: lineageDefinition,
            isLoading: defIsLoading,
            error: defError,
        } = lapisClientHooks(lapisUrl).useLineageDefinition(
            {
                params: {
                    column: fieldName,
                },
            },
            {},
        );

        const unaggregatedCounts = new Map<string, number>();

        // set initial counts
        if (data?.data) {
            data.data
                .filter(
                    (it) =>
                        typeof it[fieldName] === 'string' ||
                        typeof it[fieldName] === 'boolean' ||
                        typeof it[fieldName] === 'number',
                )
                .forEach((it) => unaggregatedCounts.set(it[fieldName]!.toString(), it.count));
        }

        const options: Option[] = [];

        if (lineageDefinition) {
            const aggregatedCounts = aggregateCounts(lineageDefinition, unaggregatedCounts, includeSublineages);

            // generate options
            Object.keys(lineageDefinition).forEach((lineageName) => {
                let count: number | undefined = aggregatedCounts.get(lineageName);
                if (count === 0) count = undefined;
                options.push({ option: lineageName, value: lineageName, count });
            });
        }

        options.sort((a, b) => (a.option.toLowerCase() < b.option.toLowerCase() ? -1 : 1));

        return {
            options,
            isPending: aggregateIsPending || defIsLoading,
            error: new AggregateError([aggregateError, defError].filter(Boolean)),
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
                    optionsProvider.includeSublineages,
                ),
                [optionsProvider],
            );
    }
};
