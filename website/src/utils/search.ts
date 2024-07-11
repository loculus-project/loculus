import type { TableSequenceData } from '../components/SearchPage/Table.tsx';
import { getReferenceGenomes } from '../config.ts';
import type { MetadataFilter } from '../types/config.ts';
import type { ReferenceGenomesSequenceNames, ReferenceAccession, NamedSequence } from '../types/referencesGenomes.ts';



export const VISIBILITY_PREFIX = 'visibility_';

export const COLUMN_VISIBILITY_PREFIX = 'column_';

const ORDER_KEY = 'orderBy';
const ORDER_DIRECTION_KEY = 'order';



export type SearchResponse = {
    data: TableSequenceData[];
    totalCount: number;
};

export function addHiddenFilters(searchFormFilter: MetadataFilter[], hiddenFilters: MetadataFilter[]) {
    const searchFormFilterNames = searchFormFilter.map((filter) => filter.name);
    const hiddenFiltersToAdd = hiddenFilters.filter((filter) => !searchFormFilterNames.includes(filter.name));
    return [...searchFormFilter, ...hiddenFiltersToAdd];
}

export const getAccession = (n: NamedSequence): ReferenceAccession => {
    return {
        name: n.name,
        insdc_accession_full: n.insdc_accession_full,
    };
};

export const getReferenceGenomesSequenceNames = (organism: string): ReferenceGenomesSequenceNames => {
    const referenceGenomes = getReferenceGenomes(organism);
    return {
        nucleotideSequences: referenceGenomes.nucleotideSequences.map((n) => n.name),
        genes: referenceGenomes.genes.map((n) => n.name),
        insdc_accession_full: referenceGenomes.nucleotideSequences.map((n) => getAccession(n)),
    };
};


const getFieldOrColumnVisibilitiesFromQuery = (schema, state, visibilityPrefix, initiallyVisibleAccessor) => {

    const visibilities = new Map<string, boolean>();
        schema.metadata.forEach((field) => {
            if (field.hideOnSequenceDetailsPage === true) {
                return;
            }
            visibilities.set(field.name, initiallyVisibleAccessor(field) === true);
        });

        const visibilityKeys = Object.keys(state).filter((key) => key.startsWith(visibilityPrefix));

        for (const key of visibilityKeys) {
            visibilities.set(key.slice(visibilityPrefix.length), state[key] === 'true');
        }
        return visibilities;
}

export const getFieldVisibilitiesFromQuery   = (schema, state) => {
    const initiallyVisibleAccessor = field => field.initiallyVisible
        return getFieldOrColumnVisibilitiesFromQuery(schema, state, VISIBILITY_PREFIX, initiallyVisibleAccessor)
}

export const getColumnVisibilitiesFromQuery  = (schema, state) => {

const initiallyVisibleAccessor = field => schema.tableColumns.includes(field.name)
        return getFieldOrColumnVisibilitiesFromQuery(schema, state, COLUMN_VISIBILITY_PREFIX, initiallyVisibleAccessor)
}


export const getFieldValuesFromQuery = (state, hiddenFieldValues) => {
    const fieldKeys = Object.keys(state)
    .filter((key) => !key.startsWith(VISIBILITY_PREFIX) && !key.startsWith(COLUMN_VISIBILITY_PREFIX))
    .filter((key) => key !== ORDER_KEY && key !== ORDER_DIRECTION_KEY);

const values: Record<string, any> = { ...hiddenFieldValues };
for (const key of fieldKeys) {
    values[key] = state[key];
}
return values;


}
