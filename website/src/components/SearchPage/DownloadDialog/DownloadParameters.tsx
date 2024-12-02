import type { FieldValues } from '../../../types/config.ts';

export type FieldFilter = {
    type: 'field';
    lapisSearchParameters: Record<string, any>;
    hiddenFieldValues: FieldValues;
};

export type SelectFilter = {
    type: 'select';
    selectedSequences: Set<string>;
};

/**
 * Either the sequences to download are specified as a bunch of filters,
 * or sequences are specified directly by ID.
 */
export type SequenceFilters = FieldFilter | SelectFilter;


// TODO Add a function on here to generate the parameters for the lapisClient from this
// refactor bits of the DownloadUrlGenerator into this.