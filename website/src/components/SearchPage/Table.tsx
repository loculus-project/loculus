import { capitalCase } from 'change-case';
import type { FC, ReactElement } from 'react';

import { routes, navigateToSearchLikePage, type ClassOfSearchPageType } from '../../routes.ts';
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
        <div className='w-full overflow-x-auto'>
            {data.length !== 0 ? (
                <table className='table'>
                    <thead>
                        <tr>
                            <th onClick={() => handleSort(primaryKey)} className='cursor-pointer'>
                                {capitalCase(primaryKey)} {orderBy.field === primaryKey && orderIcon}
                            </th>
                            {columns.map((c) => (
                                <th key={c.field} onClick={() => handleSort(c.field)} className='cursor-pointer'>
                                    {c.headerName} {orderBy.field === c.field && orderIcon}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, index) => (
                            <tr key={index}>
                                <td>
                                    <a href={routes.sequencesDetailsPage(organism, row[primaryKey] as string)}>
                                        {row[primaryKey]}
                                    </a>
                                </td>
                                {columns.map((c) => (
                                    <td key={`${index}-${c.field}`}>{row[c.field]}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <div className='flex justify-center font-bold text-xl mb-5'>No Data</div>
            )}
        </div>
    );
};
