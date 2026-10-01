import { useCallback, useMemo, useRef } from 'react';

import { lapisClientHooks } from '../../../services/serviceHooks.ts';
import type { LineageDefinition } from '../../../types/lapis.ts';
import { NULL_QUERY_VALUE } from '../../../utils/search.ts';
import { stringifyMaybeAxiosError } from '../../../utils/stringifyMaybeAxiosError.ts';
import type { LapisSearchParameters } from '../DownloadDialog/SequenceFilters.tsx';

export type Option = {
    option: string;
    value: string; // Always a string, using NULL_QUERY_VALUE for nulls
    count: number;
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
    /**
     * When true, show only the alias for a lineage (when one exists) instead of the canonical
     * name. Used by hierarchical filters where the alias is the user-facing label.
     */
    showAlias?: boolean;
    /**
     * When false, only show options with a count higher than zero
     */
    includeZeroCounts?: boolean;
};

/* Defines where how the options in the dropdown of the AutocompleteField are fetched. */
export type OptionsProvider = GenericOptionsProvider | LineageOptionsProvider;

/**
 * headlessui's Combobox re-runs every mounted option's selector on each option registration (O(n²) on open and
 * on every keystroke): 1000 options cost ~3 s of main thread, 100 cost ~30 ms. Users narrow the list by typing.
 */
export const DEFAULT_MAX_DISPLAYED_OPTIONS = 100;

/** One shared collator: `localeCompare` with options builds a new one per comparison (~20x slower). */
export const optionCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/**
 * Calls `mutate` only when the params differ from the last successful load, so re-focusing a field does not
 * refetch (and flash "Loading...") for identical params.
 */
function useDedupedLoad(lapisParams: object, mutate: (params: never) => void, hasError: boolean) {
    const lastLoadedKey = useRef<string | null>(null);
    return () => {
        const key = JSON.stringify(lapisParams);
        if (key === lastLoadedKey.current && !hasError) return;
        lastLoadedKey.current = key;
        mutate(lapisParams as never);
    };
}

export type AutocompleteOptionsHook = () => {
    options: Option[];
    isPending: boolean;
    error: string | null;
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
        const load = useDedupedLoad(lapisParams, mutate, Boolean(error));

        const options: Option[] = useMemo(
            () =>
                (data?.data ?? [])
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
                    .sort((a, b) => optionCollator.compare(a.option, b.option)),
            [data],
        );

        return {
            options,
            // Before the first load the mutation is idle; treat that as loading rather than "No options". Once data
            // exists, keep showing it during a reload instead of swapping in "Loading...".
            isPending: data ? false : isPending || !error,
            error: error
                ? `Error while loading options for field "${fieldName}": ${stringifyMaybeAxiosError(error)}`
                : null,
            load,
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
                const existingChildren = children.get(parent);
                if (existingChildren) existingChildren.push(lineage);
                else children.set(parent, [lineage]);
            });
        }

        // traverse tree and collect counts
        for (const lineage of Object.keys(lineageDefinition)) {
            const descendants = new Set<string>();
            // Distinct descendants (not a bottom-up sum): the definition is a DAG, so a recombinant reachable via
            // two parents must be counted once. Appending to one queue keeps this O(subtree size).
            const toVisit: string[] = [lineage];
            // Array iteration also visits elements pushed during the loop.
            for (const currentElement of toVisit) {
                if (descendants.has(currentElement)) continue;
                descendants.add(currentElement);
                for (const child of children.get(currentElement) ?? []) toVisit.push(child);
            }
            let count = 0;
            for (const descendant of descendants) count += canonicalCounts.get(descendant) ?? 0;
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
    showAlias: boolean,
    includeZeroCounts: boolean,
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
            isPending: aggregatedEndpointIsPending,
            error: aggregatedEndpointError,
            mutate,
        } = lapisClientHooks(lapisUrl).useAggregated();

        const {
            data: lineageDefinition,
            isLoading: definitionIsLoading,
            error: definitionEndpointError,
        } = lapisClientHooks(lapisUrl).useLineageDefinition(
            {
                params: {
                    column: fieldName,
                },
            },
            {},
        );

        const load = useDedupedLoad(lapisParams, mutate, Boolean(aggregatedEndpointError));

        const options = useMemo(() => {
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
                    const count: number = aggregatedCounts.get(lineageName) ?? 0;
                    if (count === 0) {
                        if (!includeZeroCounts) return;
                    }

                    const aliases = lineageDefinition[lineageName].aliases ?? [];
                    const label = showAlias && aliases.length > 0 ? aliases[0] : lineageName;
                    options.push({ option: label, value: lineageName, count });
                });
            }

            options.sort((a, b) => optionCollator.compare(a.option, b.option));
            return options;
        }, [data, lineageDefinition, includeSublineages, showAlias, includeZeroCounts]);

        const errors = [
            aggregatedEndpointError && `aggregated endpoint: ${stringifyMaybeAxiosError(aggregatedEndpointError)}`,
            definitionEndpointError &&
                `lineage definition endpoint: ${stringifyMaybeAxiosError(definitionEndpointError)}`,
        ].filter(Boolean);

        return {
            options,
            // See the generic hook: idle-before-first-load counts as loading; a reload keeps the current options.
            isPending: definitionIsLoading || (data ? false : aggregatedEndpointIsPending || !aggregatedEndpointError),
            error:
                errors.length > 0
                    ? `Error while loading lineage autocomplete options for field "${fieldName}" from ${lapisUrl}: ${errors.join('; ')}`
                    : null,
            load,
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
                    optionsProvider.showAlias ?? false,
                    optionsProvider.includeZeroCounts ?? true,
                ),
                [optionsProvider],
            );
    }
};
