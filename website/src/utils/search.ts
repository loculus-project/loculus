import type { TableSequenceData } from '../components/SearchPage/Table.tsx';
import { getReferenceGenomes } from '../config.ts';
import type { MetadataFilter } from '../types/config.ts';
import type { ReferenceGenomesSequenceNames } from '../types/referencesGenomes.ts';

export type SearchResponse = {
    data: TableSequenceData[];
    totalCount: number;
};

export function addHiddenFilters(searchFormFilter: MetadataFilter[], hiddenFilters: MetadataFilter[]) {
    const searchFormFilterNames = searchFormFilter.map((filter) => filter.name);
    const hiddenFiltersToAdd = hiddenFilters.filter((filter) => !searchFormFilterNames.includes(filter.name));
    return [...searchFormFilter, ...hiddenFiltersToAdd];
}
export const getReferenceGenomesSequenceNames = (organism: string): ReferenceGenomesSequenceNames => {
    const referenceGenomes = getReferenceGenomes(organism);
    return {
        nucleotideSequences: referenceGenomes.nucleotideSequences.map((n) => n.name),
        genes: referenceGenomes.genes.map((n) => n.name),
    };
};
