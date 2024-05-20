import type { FC } from 'react';


type ActiveDownloadFiltersProps = {
    lapisSearchParameters: Record<string, any>;
};

export const ActiveDownloadFilters: FC<ActiveDownloadFiltersProps> = ({lapisSearchParameters  }) => {
    return null;
    // TODONOW
    lapisSearchParameters.forEach((value, key) => {
        if (value !== undefined && value !== '') {
            filterValues.push({ name: key, filterValue: value });
        }
    }
    );


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
