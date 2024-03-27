import { capitalCase } from 'change-case';
import type { FC, ReactElement } from 'react';
import { Tooltip } from 'react-tooltip';

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
    groupId?: number;
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
    groupId,
}) => {
    const primaryKey = schema.primaryKey;

    const maxLengths = Object.fromEntries(schema.metadata.map((m) => [m.name, m.truncateColumnDisplayTo ?? 100]));

    const columns = schema.tableColumns.map((field) => ({
        field,
        headerName: schema.metadata.find((m) => m.name === field)?.displayName ?? capitalCase(field),
        maxLength: maxLengths[field],
    }));

    const handleSort = (field: string) => {
        if (orderBy.field === field) {
            if (orderBy.type === 'ascending') {
                navigateToSearchLikePage(
                    organism,
                    classOfSearchPage,
                    groupId,
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
                    groupId,
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
                groupId,
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
            <Tooltip id='table-tip' />
            {data.length !== 0 ? (
                <table className='w-full text-left border-collapse'>
                    <thead>
                        <tr>
                            <th
                                onClick={() => handleSort(primaryKey)}
                                className='px-2 py-3 pl-6 text-xs font-medium tracking-wider text-gray-500 uppercase cursor-pointer text-left'
                            >
                                {capitalCase(primaryKey)} {orderBy.field === primaryKey && orderIcon}
                            </th>
                            {columns.map((c) => (
                                <th
                                    key={c.field}
                                    onClick={() => handleSort(c.field)}
                                    className='px-2 py-3 text-xs font-medium tracking-wider text-gray-500 uppercase cursor-pointer last:pr-6 text-left'
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
                                    <td
                                        key={`${index}-${c.field}`}
                                        className='px-2 py-2  text-primary-900  last:pr-6'
                                        data-tooltip-content={
                                            typeof row[c.field] === 'string' &&
                                            row[c.field]!.toString().length > c.maxLength
                                                ? row[c.field]!.toString()
                                                : ''
                                        }
                                        data-tooltip-id='table-tip'
                                    >
                                        {typeof row[c.field] === 'string' &&
                                        row[c.field]!.toString().length > c.maxLength
                                            ? `${row[c.field]?.toString().slice(0, c.maxLength)}…`
                                            : row[c.field]}
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
