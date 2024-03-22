import { capitalCase } from 'change-case';
import type { FC, ReactElement } from 'react';

import { routes, navigateToSearchLikePage, type ClassOfSearchPageType } from '../../routes/routes.ts';
import type { AccessionFilter, MetadataFilter, MutationFilter, Schema } from '../../types/config.ts';
import type { OrderBy } from '../../types/lapis.ts';
import MdiTriangle from '~icons/mdi/triangle';
import MdiTriangleDown from '~icons/mdi/triangle-down';
export type TableSequenceData = {
    [key: string]: string | number | null;
};

type TableProps = {
    organism: string;
    schema: Schema;
    data: TableSequenceData[];
    metadataFilter: MetadataFilter[];
    accessionFilter: AccessionFilter;
    mutationFilter: MutationFilter;
    page: number;
    orderBy: OrderBy;
    classOfSearchPage: ClassOfSearchPageType;
    group?: string;
};

export const Table: FC<TableProps> = ({
    organism,
    data,
    schema,
    metadataFilter,
    accessionFilter,
    mutationFilter,
    page,
    orderBy,
    classOfSearchPage,
    group,
}) => {
    const primaryKey = schema.primaryKey;

    const columns = schema.tableColumns.map((field) => ({
        field,
        headerName: capitalCase(field),
    }));

    const handleSort = (field: string) => {
        if (orderBy.field === field) {
            if (orderBy.type === 'ascending') {
                navigateToSearchLikePage(
                    organism,
                    classOfSearchPage,
                    group,
                    metadataFilter,
                    accessionFilter,
                    mutationFilter,
                    page,
                    {
                        field,
                        type: 'descending',
                    },
                );
            } else {
                navigateToSearchLikePage(
                    organism,
                    classOfSearchPage,
                    group,
                    metadataFilter,
                    accessionFilter,
                    mutationFilter,
                    page,
                    {
                        field,
                        type: 'ascending',
                    },
                );
            }
        } else {
            navigateToSearchLikePage(
                organism,
                classOfSearchPage,
                group,
                metadataFilter,
                accessionFilter,
                mutationFilter,
                page,
                {
                    field,
                    type: 'ascending',
                },
            );
        }
    };

    const orderIcon: ReactElement =
        orderBy.type === 'ascending' ? (
            <MdiTriangle className='w-3 h-3 ml-1 inline' />
        ) : (
            <MdiTriangleDown className='w-3 h-3 ml-1 inline' />
        );

    return (
        <div className='w-full overflow-x-auto text-sm'>
            {data.length !== 0 ? (
                <table className='w-full text-left border-collapse'>
                    <thead>
                        <tr>
                            <th
                                onClick={() => handleSort(primaryKey)}
                                className='px-2 py-3 pl-6 text-xs font-medium tracking-wider text-gray-500 uppercase cursor-pointer'
                            >
                                {capitalCase(primaryKey)} {orderBy.field === primaryKey && orderIcon}
                            </th>
                            {columns.map((c) => (
                                <th
                                    key={c.field}
                                    onClick={() => handleSort(c.field)}
                                    className='px-2 py-3 text-xs font-medium tracking-wider text-gray-500 uppercase cursor-pointer last:pr-6'
                                >
                                    {c.headerName} {orderBy.field === c.field && orderIcon}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className='bg-white'>
                        {data.map((row, index) => (
                            <tr key={index} className='hover:bg-primary-100 border-gray-100 '>
                                <td className='px-2  whitespace-nowrap    text-primary-900 pl-6'>
                                    <a
                                        href={routes.sequencesDetailsPage(row[primaryKey] as string)}
                                        className='text-primary-900 hover:text-primary-800'
                                    >
                                        {row[primaryKey]}
                                    </a>
                                </td>
                                {columns.map((c) => (
                                    <td key={`${index}-${c.field}`} className='px-2 py-2  text-primary-900  last:pr-6'>
                                        {row[c.field]}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <div className='flex justify-center font-bold text-xl my-8'>No Data</div>
            )}
        </div>
    );
};
