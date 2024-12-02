import type { FieldValues } from '../../../types/config.ts';

export interface SequenceFilter {
    isEmpty(): boolean;

    /**
     * Return the filter as URL params to use with the LAPIS API.
     */
    toLapisParams(): URLSearchParams;

    /**
     * Return a map of keys to human readable descriptions of the filters to apply.
     */
    toDisplayStrings(): Map<string, string>;
}

/**
 * Filter sequences based on certain fields that have to match, i.e. 'country == China' or
 * 'data use terms == OPEN'.
 */
export class FieldFilter implements SequenceFilter {
    private readonly lapisSearchParameters: Record<string, any>;
    private readonly hiddenFieldValues: FieldValues;

    constructor(lapisSearchParamters: Record<string, any>, hiddenFieldValues: FieldValues) {
        this.lapisSearchParameters = lapisSearchParamters;
        this.hiddenFieldValues = hiddenFieldValues;
    }

    public toLapisParams(): URLSearchParams {
        const params = new URLSearchParams();

        const lapisSearchParameters = this.lapisSearchParameters;
        if (lapisSearchParameters.accession !== undefined) {
            for (const accession of lapisSearchParameters.accession) {
                params.append('accession', accession);
            }
        }

        const mutationKeys = [
            'nucleotideMutations',
            'aminoAcidMutations',
            'nucleotideInsertions',
            'aminoAcidInsertions',
        ];

        for (const [key, value] of Object.entries(lapisSearchParameters)) {
            // Skip accession and mutations
            if (key === 'accession' || mutationKeys.includes(key)) {
                continue;
            }
            const stringValue = String(value);
            const trimmedValue = stringValue.trim();
            if (trimmedValue.length > 0) {
                params.set(key, trimmedValue);
            }
        }

        mutationKeys.forEach((key) => {
            if (lapisSearchParameters[key] !== undefined) {
                params.set(key, lapisSearchParameters[key].join(','));
            }
        });

        return params;
    }

    public toDisplayStrings(): Map<string, string> {
        return new Map(Object.entries(this.lapisSearchParameters)
            .filter((vals) => vals[1] !== undefined && vals[1] !== '')
            .filter(
                ([name, val]) =>
                    !(
                        Object.keys(this.hiddenFieldValues).includes(name) &&
                        this.hiddenFieldValues[name] === val
                    ),
            )
            .map(([name, filterValue]) => ({ name, filterValue: filterValue !== null ? filterValue : '' }))
            .filter(({ filterValue }) => filterValue.length > 0)
            .map(({name, filterValue}) => 
                [name, `${name} : ${typeof filterValue === 'object' ? filterValue.join(', ') : filterValue}`]
            ));
    }

    public isEmpty(): boolean {
        return this.toDisplayStrings.length === 0;
    }
}

/**
 * Filter sequences based on an explicit set of accessionVersions.
 */
export class SelectFilter implements SequenceFilter {
    private readonly selectedSequences: Set<string>;

    constructor(selectedSequences: Set<string>) {
        this.selectedSequences = selectedSequences;
    }

    public toLapisParams(): URLSearchParams {
        const params = new URLSearchParams();

        const sortedIds = Array.from(this.selectedSequences).sort();
        sortedIds.forEach((accessionVersion) => {
            params.append('accessionVersion', accessionVersion);
        });

        return params;
    }

    public toDisplayStrings(): Map<string, string> {
        const count = this.selectedSequences.size;
        if (count === 0) return new Map();
        const description = `${count.toLocaleString()} sequence${count === 1 ? '' : 's'} selected`;
        return new Map([['selectedSequences', description]]);
    }

    public isEmpty(): boolean {
        return this.selectedSequences.size === 0;
    }
}
