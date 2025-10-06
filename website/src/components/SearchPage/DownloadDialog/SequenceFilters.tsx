import { type FieldValues } from '../../../types/config.ts';
import { type ReferenceGenomesLightweightSchema, SINGLE_REFERENCE } from '../../../types/referencesGenomes.ts';
import { intoMutationSearchParams } from '../../../utils/mutation.ts';
import { MetadataFilterSchema } from '../../../utils/search.ts';

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
    toUrlSearchParams(): [string, string | string[]][];

    /**
     * Return a map of keys to human-readable descriptions of the filters to apply.
     * null values are maintained as null.
     */
    toDisplayStrings(): Map<string, [string, string | (string | null)[] | null]>;
}

/**
 * A collection of {@link FieldValues} which can be used to retrieve a filtered subset of sequence entries.
 * Sequences are filtered based on certain fields that have to match, i.e. 'country == China' or 'data use terms == OPEN'.
 */
export class FieldFilterSet implements SequenceFilter {
    private readonly filterSchema: MetadataFilterSchema;
    private readonly fieldValues: FieldValues;
    private readonly hiddenFieldValues: FieldValues;
    private readonly referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema;

    /**
     * @param filterSchema The {@link MetadataFilterSchema} to use. Provides labels and other
     *     additional info for how to apply a certain value to a metadata field as a filter.
     * @param fieldValues The {@link FieldValues} that are used to filter sequence entries.
     * @param hiddenFieldValues key-value combinations of fields that should be hidden when converting
     *     displaying the field values (because these are default values).
     * @param referenceGenomeSequenceNames Necessary to construct mutation API params.
     */
    constructor(
        filterSchema: MetadataFilterSchema,
        fieldValues: FieldValues,
        hiddenFieldValues: FieldValues,
        referenceGenomeSequenceNames: ReferenceGenomesLightweightSchema,
    ) {
        this.filterSchema = filterSchema;
        this.fieldValues = fieldValues;
        this.hiddenFieldValues = hiddenFieldValues;
        this.referenceGenomeLightweightSchema = referenceGenomeSequenceNames;
    }

    /**
     * Creates an empty filter.
     * This is a convenience function, mostly used for testing.
     */
    public static empty() {
        return new FieldFilterSet(
            new MetadataFilterSchema([]),
            {},
            {},
            { [SINGLE_REFERENCE]: { nucleotideSegmentNames: [], geneNames: [], insdcAccessionFull: [] } },
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
            this.fieldValues.mutation,
            this.referenceGenomeLightweightSchema,
        );

        return {
            ...sequenceFilters,
            ...mutationSearchParams,
        };
    }

    public toUrlSearchParams(): [string, string | string[]][] {
        const result: [string, string | string[]][] = [];

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

            if (Array.isArray(value)) {
                if (value.length > 0) {
                    result.push([key, value]);
                }
            } else {
                const stringValue = String(value);
                const trimmedValue = stringValue.trim();
                if (trimmedValue.length > 0) {
                    result.push([key, trimmedValue]);
                }
            }
        }

        return result;
    }

    private isHiddenFieldValue(fieldName: string, fieldValue: unknown) {
        return (
            Object.keys(this.hiddenFieldValues).includes(fieldName) && this.hiddenFieldValues[fieldName] === fieldValue
        );
    }

    public toDisplayStrings(): Map<string, [string, string | (string | null)[] | null]> {
        return new Map(
            Object.entries(this.fieldValues)
                .filter(([name, filterValue]) => !this.isHiddenFieldValue(name, filterValue))
                .map(([name, filterValue]): [string, [string, string | (string | null)[] | null]] => [
                    name,
                    [
                        this.filterSchema.getLabel(name),
                        filterValue === null ? null : this.filterValueDisplayString(name, filterValue),
                    ],
                ]),
        );
    }

    private filterValueDisplayString(fieldName: string, value: any): string | (string | null)[] {
        if (Array.isArray(value)) {
            // Preserve arrays (including nulls) so ActiveFilters can render them correctly
            return value as (string | null)[];
        }

        let result = value;
        if (this.filterSchema.getType(fieldName) === 'timestamp') {
            const date = new Date(Number(value) * 1000);
            result = date.toISOString().split('T')[0]; // Extract YYYY-MM-DD
        }
        if (typeof result === 'string' && result.length > 40) {
            result = `${result.substring(0, 37)}...`;
        }
        return result;
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

const makeCaseInsensitiveLiteralSubstringRegex = (input: string | string[]): string => {
  const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  if (Array.isArray(input)) {
    // Join the escaped entries with | (OR)
    const escapedParts = input.map(escapeRegex).join('|');
    return `(?i)(?:${escapedParts})`;
  } else {
    return `(?i)${escapeRegex(input)}`;
  }
};

/**
 * A {@link SequenceFilter} implementation that filters using an explicit list of accessionVersions.
 */
export class SequenceEntrySelection implements SequenceFilter {
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

    public toUrlSearchParams(): [string, string | string[]][] {
        const result: [string, string | string[]][] = [];
        Array.from(this.selectedSequences)
            .sort()
            .forEach((sequence) => {
                result.push(['accessionVersion', sequence]);
            });
        return result;
    }

    public toDisplayStrings(): Map<string, [string, string | (string | null)[] | null]> {
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
