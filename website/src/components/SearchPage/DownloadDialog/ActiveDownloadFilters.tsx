import type { FC } from 'react';


type ActiveDownloadFiltersProps = {
    lapisSearchParameters: Record<string, any>;
};

export const ActiveDownloadFilters: FC<ActiveDownloadFiltersProps> = ({lapisSearchParameters  }) => {
    let filterValues = Object.entries(lapisSearchParameters)
        .filter((vals) => vals[1] !== undefined && vals[1] !== '')
        .map(([name, filterValue]) => ({ name, filterValue }));
    
    filterValues = filterValues.filter(({ filterValue }) => filterValue.length>0)

    if (filterValues.length === 0) {
        return null;
    }

    return (
        <div className='mb-4'>
            <h4 className='font-bold mb-2'>Active filters:</h4>
            <div className='flex flex-row flex-wrap gap-4'>
                {filterValues.map(({ name, filterValue }) => (
                    <div key={name} className='border-black border rounded-full px-2 py-1 text-sm'>
                        {name}: {// join commas for multiple values
                        typeof filterValue === 'object' ? filterValue.join(', ') : filterValue}
                    </div>
                ))}
            </div>
        </div>
    );
};
