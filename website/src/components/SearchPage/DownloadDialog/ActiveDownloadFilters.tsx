import type { FC } from 'react';

import type { DownloadParameters } from './DownloadParameters';

type ActiveDownloadFiltersProps = {
    downloadParameters: DownloadParameters;
};

export const ActiveDownloadFilters: FC<ActiveDownloadFiltersProps> = ({ downloadParameters }) => {
    let badges = null;
    const badgeClasses = 'border-black border rounded-full px-2 py-1 text-sm';

    switch (downloadParameters.type) {
        case 'filter': {
            let filterValues = Object.entries(downloadParameters.lapisSearchParameters)
                .filter((vals) => vals[1] !== undefined && vals[1] !== '')
                .filter(
                    ([name, val]) =>
                        !(
                            Object.keys(downloadParameters.hiddenFieldValues).includes(name) &&
                            downloadParameters.hiddenFieldValues[name] === val
                        ),
                )
                .map(([name, filterValue]) => ({ name, filterValue: filterValue !== null ? filterValue : '' }));

            filterValues = filterValues.filter(({ filterValue }) => filterValue.length > 0);

            if (filterValues.length > 0) {
                badges = filterValues.map(({ name, filterValue }) => (
                    <div key={name} className={badgeClasses}>
                        {name}: {typeof filterValue === 'object' ? filterValue.join(', ') : filterValue}
                    </div>
                ));
            }
            break;
        }
        case 'select': {
            const count = downloadParameters.selectedSequences.length;
            if (count > 0) {
                badges = (
                    <div className={badgeClasses}>
                        {count.toLocaleString()} sequence{count === 1 ? '' : 's'} selected
                    </div>
                );
            }
            break;
        }
    }

    return (
        <div className='mb-4'>
            <h4 className='font-bold mb-2'>Active filters:</h4>
            <div className='flex flex-row flex-wrap gap-4'>{badges}</div>
        </div>
    );
};
