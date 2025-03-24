import { type FieldValues } from '../../../types/config.ts';
import type { ReferenceGenomesSequenceNames } from '../../../types/referencesGenomes.ts';
import { intoMutationSearchParams } from '../../../utils/mutation.ts';
import { FilterSchema } from '../../../utils/search.ts';

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return --
 TODO(#3451) we should use `unknown` or proper types instead of `any` */

export type LapisSearchParameters = Record<string, any>;
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
    toApiParams(): LapisSearchParameters;

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
    private readonly filterSchema: FilterSchema;
    private readonly fieldValues: FieldValues;
    private readonly hiddenFieldValues: FieldValues;
    private readonly referenceGenomeSequenceNames: ReferenceGenomesSequenceNames;

    constructor(
        filterSchema: FilterSchema,
        fieldValues: FieldValues,
        hiddenFieldValues: FieldValues,
        referenceGenomeSequenceNames: ReferenceGenomesSequenceNames,
    ) {
        this.filterSchema = filterSchema;
        this.fieldValues = fieldValues;
        this.hiddenFieldValues = hiddenFieldValues;
        this.referenceGenomeSequenceNames = referenceGenomeSequenceNames;
    }

    /**
     * Creates an empty filter.
     * This is a convenience function, mostly used for testing.
     */
    public static empty() {
        return new FieldFilter(
            new FilterSchema([]),
            {},
            {},
            { nucleotideSequences: [], genes: [], insdcAccessionFull: [] },
        );
    }

    public sequenceCount(): number | undefined {
        return undefined; // sequence count not known
    }

    public isEmpty(): boolean {
        return this.toDisplayStrings().size === 0;
    }

    public toApiParams(): LapisSearchParameters {
        const sequenceFilters = Object.fromEntries(
            Object.entries(this.fieldValues as Record<string, any>).filter(
                ([, value]) => value !== undefined && value !== '',
            ),
        );
        for (const filterName of Object.keys(sequenceFilters)) {
            if (this.filterSchema.isSubstringSearchEnabled(filterName) && sequenceFilters[filterName] !== undefined) {
                sequenceFilters[filterName.concat('.regex')] = makeCaseInsensitiveLiteralSubstringRegex(
                    sequenceFilters[filterName],
                );
                delete sequenceFilters[filterName];
            }
        }

        if (sequenceFilters.accession !== '' && sequenceFilters.accession !== undefined) {
            sequenceFilters.accession = textAccessionsToList(sequenceFilters.accession);
        }

        delete sequenceFilters.mutation;
        const mutationSearchParams = intoMutationSearchParams(
            this.fieldValues.mutation as any,
            this.referenceGenomeSequenceNames,
        );

        return {
            ...sequenceFilters,
            ...mutationSearchParams,
        };
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

        const lapisSearchParameters = this.toApiParams();

        // accession
        if (lapisSearchParameters.accession !== undefined) {
            lapisSearchParameters.accession.forEach((a: any) => result.push(['accession', String(a)]));
        }

        // mutations
        mutationKeys.forEach((key) => {
            if (lapisSearchParameters[key] !== undefined) {
                (lapisSearchParameters[key] as string[]).forEach((m) => result.push([key, m]));
            }
        });

        // default keys
        for (const [key, value] of Object.entries(lapisSearchParameters)) {
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
        const lapisSearchParameters = this.toApiParams(); // TODO we probably want to change this to this.fieldValues
        return new Map(
            Object.entries(lapisSearchParameters)
                .filter((vals) => vals[1] !== undefined && vals[1] !== '')
                .filter(
                    ([name, val]) =>
                        !(Object.keys(this.hiddenFieldValues).includes(name) && this.hiddenFieldValues[name] === val),
                )
                .map(([name, filterValue]) => ({ name, filterValue: filterValue !== null ? filterValue : '' }))
                .filter(({ filterValue }) => filterValue.length > 0)
                .map(({ name, filterValue }): [string, [string, string]] => [
                    name,
                    [this.filterSchema.getLabel(name), this.filterValueDisplayString(name, filterValue)],
                ]),
        );
    }

    private filterValueDisplayString(fieldName: string, value: any): string {
        if (this.filterSchema.getType(fieldName) === 'timestamp') {
            const date = new Date(Number(value) * 1000);
            return date.toISOString().split('T')[0]; // Extract YYYY-MM-DD
        }
        if (Array.isArray(value)) {
            let stringified = value.join(', ');
            if (stringified.length > 40) {
                stringified = `${stringified.substring(0, 37)}...`;
            }
            return stringified;
        }
        return value;
    }
}
/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

const textAccessionsToList = (text: string): string[] => {
    const accessions = text
        .split(/[\t,;\n ]/)
        .map((s) => s.trim())
        .filter((s) => s !== '')
        .map((s) => {
            if (s.includes('.')) {
                return s.split('.')[0];
            }
            return s;
        });

    return accessions;
};

const makeCaseInsensitiveLiteralSubstringRegex = (s: string): string => {
    // takes raw string and escapes all special characters and prefixes (?i) for case insensitivity
    return `(?i)${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
};

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
