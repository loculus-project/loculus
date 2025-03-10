import { type FieldValues } from '../../../types/config.ts';
import type { ConsolidatedMetadataFilters } from '../../../utils/search.ts';

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return --
 TODO(#3451) we should use `unknown` or proper types instead of `any` */
export interface SequenceFilter {
    /**
     * Whether this filter is actually filtering anything or not.
     */
    isEmpty(): boolean;

    /**
     * The count of sequences that match the filter, if known.
     */
    sequenceCount(): number | undefined;

    /**
     * Return the filter as params to use in API Queries.
     */
    toApiParams(): Record<string, any>;

    /**
     * Return the filter as params to build a URL from.
     */
    toUrlSearchParams(): [string, string][];

    /**
     * Return a map of keys to human-readable descriptions of the filters to apply.
     */
    toDisplayStrings(): Map<string, [string, string]>;
}

/**
 * Filter sequences based on certain fields that have to match, i.e. 'country == China' or
 * 'data use terms == OPEN'.
 */
export class FieldFilter implements SequenceFilter {
    private readonly lapisSearchParameters: Record<string, any>;
    private readonly hiddenFieldValues: FieldValues;
    private readonly schema: ConsolidatedMetadataFilters;

    constructor(
        lapisSearchParamters: Record<string, any>,
        hiddenFieldValues: FieldValues,
        schema: ConsolidatedMetadataFilters,
    ) {
        this.lapisSearchParameters = lapisSearchParamters;
        this.hiddenFieldValues = hiddenFieldValues;
        this.schema = schema;
    }

    public sequenceCount(): number | undefined {
        return undefined; // sequence count not known
    }

    public isEmpty(): boolean {
        return this.toDisplayStrings().size === 0;
    }

    public toApiParams(): Record<string, any> {
        return this.lapisSearchParameters;
    }

    public toUrlSearchParams(): [string, string][] {
        const result: [string, string][] = [];

        // keys that need special handling
        const accessionKey = 'accession';
        const mutationKeys = [
            'nucleotideMutations',
            'aminoAcidMutations',
            'nucleotideInsertions',
            'aminoAcidInsertions',
        ];
        const skipKeys = mutationKeys.concat([accessionKey]);

        // accession
        if (this.lapisSearchParameters.accession !== undefined) {
            this.lapisSearchParameters.accession.forEach((a: any) => result.push(['accession', String(a)]));
        }

        // mutations
        mutationKeys.forEach((key) => {
            if (this.lapisSearchParameters[key] !== undefined) {
                (this.lapisSearchParameters[key] as string[]).forEach((m) => result.push([key, m]));
            }
        });

        // default keys
        for (const [key, value] of Object.entries(this.lapisSearchParameters)) {
            if (skipKeys.includes(key)) {
                continue;
            }
            const stringValue = String(value);
            const trimmedValue = stringValue.trim();
            if (trimmedValue.length > 0) {
                result.push([key, trimmedValue]);
            }
        }

        return result;
    }

    public toDisplayStrings(): Map<string, [string, string]> {
        return new Map(
            Object.entries(this.lapisSearchParameters)
                .filter((vals) => vals[1] !== undefined && vals[1] !== '')
                .filter(
                    ([name, val]) =>
                        !(Object.keys(this.hiddenFieldValues).includes(name) && this.hiddenFieldValues[name] === val),
                )
                .map(([name, filterValue]) => ({ name, filterValue: filterValue !== null ? filterValue : '' }))
                .filter(({ filterValue }) => filterValue.length > 0)
                .map(({ name, filterValue }): [string, [string, string]] => [
                    name,
                    [this.findSchemaLabel(name), this.filterValueDisplayString(filterValue)],
                ]),
        );
    }

    private filterValueDisplayString(value: any): string {
        if (Array.isArray(value)) {
            let stringified = value.join(', ');
            if (stringified.length > 40) {
                stringified = `${stringified.substring(0, 37)}...`;
            }
            return stringified;
        }
        return value;
    }

    private findSchemaLabel(filterName: string): string {
        let displayName = this.schema
            .map((metadata) => {
                if (metadata.grouped === true) {
                    const groupedField = metadata.groupedFields.find(
                        (groupedMetadata) => groupedMetadata.name === filterName,
                    );
                    if (groupedField) {
                        return `${metadata.displayName} - ${groupedField.label}`;
                    }
                }
            })
            .find((x) => x !== undefined);
        if (displayName === undefined) {
            displayName = this.schema.find((metadata) => metadata.name === filterName)?.displayName;
        }
        return displayName ?? filterName;
    }
}
/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

/**
 * Filter sequences based on an explicit set of accessionVersions.
 */
export class SelectFilter implements SequenceFilter {
    private readonly selectedSequences: Set<string>;

    constructor(selectedSequences: Set<string>) {
        this.selectedSequences = selectedSequences;
    }

    public sequenceCount(): number | undefined {
        return this.selectedSequences.size;
    }

    public isEmpty(): boolean {
        return this.selectedSequences.size === 0;
    }

    public toApiParams(): Record<string, string | string[]> {
        return { accessionVersion: Array.from(this.selectedSequences).sort() };
    }

    public toUrlSearchParams(): [string, string][] {
        const result: [string, string][] = [];
        Array.from(this.selectedSequences)
            .sort()
            .forEach((sequence) => {
                result.push(['accessionVersion', sequence]);
            });
        return result;
    }

    public toDisplayStrings(): Map<string, [string, string]> {
        const count = this.selectedSequences.size;
        if (count === 0) return new Map();
        const seqs = Array.from(this.selectedSequences).sort();
        if (count === 1) {
            return new Map([['selectedSequences', ['single sequence', seqs[0]]]]);
        }
        if (count === 2) {
            return new Map([['selectedSequences', ['sequences selected', seqs.join(', ')]]]);
        }
        return new Map([['selectedSequences', ['sequences selected', count.toLocaleString()]]]);
    }
}
