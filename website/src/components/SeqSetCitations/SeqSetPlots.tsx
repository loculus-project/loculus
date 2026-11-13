import { Zodios } from '@zodios/core';
import { DateTime } from 'luxon';
import React from 'react';

import { lapisApi } from '../../services/lapisApi.ts';
import { ACCESSION_FIELD, ACCESSION_VERSION_FIELD, VERSION_STATUS_FIELD } from '../../settings.ts';
import { type LapisBaseRequest, versionStatuses } from '../../types/lapis.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { BarPlot } from '../common/BarPlot';

interface SeqSetPlotProps {
    data: AggregateRow[];
    description?: string;
    barColor?: string;
    dateFormat?: string;
}

interface CategoryPlotProps extends SeqSetPlotProps {
    visibleCategoryLimit?: number;
}

type GraphTimeProperties = {
    unit: 'day' | 'month' | 'year';
    displayFormats: { day?: string; month?: string; year?: string };
    tooltipFormat: string;
};

type AggregateValue = string | number | boolean | null | undefined;
export type AggregateRow = { value: AggregateValue; count: number };

/**
 * Fetches aggregates for the accessions across all organisms in organismFields, and combines them into a single aggregate result.
 * organismFields maps each organism to the field to aggregate on for that organism.
 */
export const fetchSeqSetAggregates = async (
    accessions: string[],
    organismFields: Record<string, string>,
    clientConfig: ClientConfig,
): Promise<AggregateRow[]> => {
    if (accessions.length === 0) {
        return [];
    }

    // Split accessions into versioned (contain '.') and unversioned (no '.')
    const versionedAccessions = accessions.filter((acc) => acc.includes('.'));
    const unversionedAccessions = accessions.filter((acc) => !acc.includes('.'));

    // Fetch a single aggregate
    const getAggregate = async (lapisUrl: string, field: string, params: LapisBaseRequest): Promise<AggregateRow[]> => {
        const client = new Zodios(lapisUrl, lapisApi, { transform: false });
        const response = await client.aggregated(params);
        return response.data.map((item) => ({
            value: item[field],
            count: item.count,
        }));
    };

    const aggregateResponses = await Promise.all(
        Object.entries(organismFields).flatMap(([organism, field]) => {
            const lapisUrl = clientConfig.lapisUrls[organism];

            // Fetch aggregates for both versioned and unversioned accessions
            const aggregates = [];
            if (versionedAccessions.length > 0) {
                aggregates.push(
                    getAggregate(lapisUrl, field, {
                        [ACCESSION_VERSION_FIELD]: versionedAccessions,
                        fields: [field],
                    }),
                );
            }
            if (unversionedAccessions.length > 0) {
                aggregates.push(
                    getAggregate(lapisUrl, field, {
                        [ACCESSION_FIELD]: unversionedAccessions,
                        [VERSION_STATUS_FIELD]: versionStatuses.latestVersion,
                        fields: [field],
                    }),
                );
            }

            return aggregates;
        }),
    );

    const crossAggregate = new Map<AggregateValue, number>();
    for (const aggregateResponse of aggregateResponses) {
        for (const aggregateRow of aggregateResponse) {
            crossAggregate.set(aggregateRow.value, (crossAggregate.get(aggregateRow.value) ?? 0) + aggregateRow.count);
        }
    }

    return Array.from(crossAggregate.entries()).map(([value, count]) => ({ value, count }));
};

/** Transform data into the format required by the graph component. */
export const getGraphData = (data: AggregateRow[], barColor?: string) => {
    const labels: (string | number | boolean)[] = [];
    const counts: number[] = [];
    let emptyCount = 0;
    data.forEach((item) => {
        if (item.value !== null && item.value !== '' && item.value !== undefined) {
            labels.push(item.value);
            counts.push(item.count);
        } else emptyCount += item.count;
    });

    return {
        graphData: {
            labels: labels,
            datasets: [{ data: counts, backgroundColor: barColor, maxBarThickness: 30 }],
        },
        emptyCount,
    };
};

/** Get the appropriate date format for the graph based on the range of dates in the data. */
export const getDateFormatFromData = (data: AggregateRow[]): string => {
    const dateValues = data
        .map((row) => (typeof row.value === 'string' ? DateTime.fromISO(row.value) : null))
        .filter((date) => date !== null)
        .filter((date) => date.isValid);
    const minDate = DateTime.min(...dateValues);
    const maxDate = DateTime.max(...dateValues);
    const diff = minDate && maxDate ? maxDate.diff(minDate, 'days').days : 0;

    let format;
    if (diff <= 60) format = 'yyyy-MM-dd';
    else if (diff <= 365) format = 'yyyy-MM';
    else format = 'yyyy';

    return format;
};

/** Group the data by the specified date format, or null if invalid */
export const groupByDateFormat = (data: AggregateRow[], format: string): AggregateRow[] => {
    // Dates will be grouped by their formatted value
    // Invalid or null dates will be grouped under null
    const groupedDates = new Map<string | null, number>();

    data.forEach((row) => {
        let formattedDate: string | null = null;

        if (typeof row.value === 'string') {
            const dateValue = DateTime.fromISO(row.value);
            if (dateValue.isValid) formattedDate = dateValue.toFormat(format);
        }

        groupedDates.set(formattedDate, (groupedDates.get(formattedDate) ?? 0) + row.count);
    });

    return Array.from(groupedDates.entries()).map(([value, count]) => ({ value, count }));
};

/** Get the corresponding graph properties for the specified date format. */
export const getGraphTimeProperties = (format: string): GraphTimeProperties => {
    if (format === 'yyyy-MM-dd')
        return { unit: 'day', displayFormats: { day: 'dd MMM yyyy' }, tooltipFormat: 'yyyy-MM-dd' };

    if (format === 'yyyy-MM') return { unit: 'month', displayFormats: { month: 'MMM yyyy' }, tooltipFormat: 'yyyy-MM' };

    return { unit: 'year', displayFormats: { year: 'yyyy' }, tooltipFormat: 'yyyy' };
};

/** Group the data by the specified cutoff, grouping remaining points into an "Others" category. */
export const groupRemainingPoints = (data: AggregateRow[], cutoff: number): AggregateRow[] => {
    const sortedData = [...data].sort((a, b) => b.count - a.count);
    const topData = sortedData.slice(0, cutoff);
    const otherData = sortedData.slice(cutoff);
    const otherCount = otherData.reduce((sum, row) => sum + row.count, 0);
    return otherCount > 0 ? [...topData, { value: `Others (${otherData.length})`, count: otherCount }] : topData;
};

export const DatePlot: React.FC<SeqSetPlotProps> = ({ data, description, barColor, dateFormat }) => {
    const format = dateFormat ?? getDateFormatFromData(data);
    const groupedData = groupByDateFormat(data, format);
    const { graphData, emptyCount } = getGraphData(groupedData, barColor);
    const graphTimeProperties = getGraphTimeProperties(format);

    return (
        <BarPlot
            data={graphData}
            description={description}
            emptyCount={emptyCount}
            options={{
                scales: {
                    x: {
                        type: 'time',
                        time: graphTimeProperties,
                        grid: {
                            color: 'rgba(0, 0, 0, 0)',
                        },
                    },
                },
            }}
        />
    );
};

export const CategoryPlot: React.FC<CategoryPlotProps> = ({
    data,
    description,
    barColor,
    visibleCategoryLimit = 10,
}) => {
    const groupedData = groupRemainingPoints(data, visibleCategoryLimit);
    const { graphData, emptyCount } = getGraphData(groupedData, barColor);
    return <BarPlot data={graphData} description={description} emptyCount={emptyCount} />;
};
