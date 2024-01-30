import type { FC } from 'react';

import type { FilterValue, MutationFilter } from '../../../types/config.ts';

type ActiveDownloadFiltersProps = {
    metadataFilter: FilterValue[];
    mutationFilter: MutationFilter;
};

export const ActiveDownloadFilters: FC<ActiveDownloadFiltersProps> = ({ metadataFilter, mutationFilter }) => {
    const filterValues: FilterValue[] = metadataFilter.filter((f) => f.filterValue.length > 0);
    [
        { name: 'nucleotideMutations', value: mutationFilter.nucleotideMutationQueries },
        { name: 'aminoAcidMutations', value: mutationFilter.aminoAcidMutationQueries },
        { name: 'nucleotideInsertion', value: mutationFilter.nucleotideInsertionQueries },
        { name: 'aminoAcidInsertions', value: mutationFilter.aminoAcidInsertionQueries },
    ].forEach(({ name, value }) => {
        if (value !== undefined) {
            filterValues.push({ name, filterValue: value.join(', ') });
        }
    });

    if (filterValues.length === 0) {
        return undefined;
    }

    return (
        <div className='mb-4'>
            <h4 className='font-bold mb-2'>Active filters:</h4>
            <div className='flex flex-row flex-wrap gap-4'>
                {filterValues.map(({ name, filterValue }) => (
                    <div key={name} className='border-black border rounded-full px-2 py-1 text-sm'>
                        {name}: {filterValue}
                    </div>
                ))}
            </div>
        </div>
    );
};
