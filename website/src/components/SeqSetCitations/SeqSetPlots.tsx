import { DateTime } from 'luxon';
import React from 'react';

import type { AggregateRow } from './getSeqSetStatistics';
import { BarPlot } from '../common/BarPlot';

type SeqSetPlotProps = {
    data: AggregateRow[];
    description?: string;
    barColor?: string;
};

type GraphTimeProperties = {
    unit: 'day' | 'month' | 'year';
    displayFormats: { day?: string; month?: string; year?: string };
    tooltipFormat: string;
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

/** Group the data by the specified date format */
export const groupByDateFormat = (data: AggregateRow[], format: string): AggregateRow[] => {
    const yearMonths = new Map<string, number>();

    data.forEach((row) => {
        if (typeof row.value !== 'string') return;

        const dateValue = DateTime.fromISO(row.value);
        if (!dateValue.isValid) return;

        const yearMonth = dateValue.toFormat(format);
        yearMonths.set(yearMonth, (yearMonths.get(yearMonth) ?? 0) + row.count);
    });

    return Array.from(yearMonths.entries()).map(([value, count]) => ({ value, count }));
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
    const sortedData = data.sort((a, b) => b.count - a.count);
    const topData = sortedData.slice(0, cutoff);
    const otherData = sortedData.slice(cutoff);
    const otherCount = otherData.reduce((sum, row) => sum + row.count, 0);
    return otherCount > 0 ? [...topData, { value: `Others (${otherData.length})`, count: otherCount }] : topData;
};

export const DatePlot: React.FC<SeqSetPlotProps> = ({ data, description, barColor }) => {
    const dateFormat = getDateFormatFromData(data);
    const groupedData = groupByDateFormat(data, dateFormat);
    const { graphData, emptyCount } = getGraphData(groupedData, barColor);
    const graphTimeProperties = getGraphTimeProperties(dateFormat);

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

export const CountriesPlot: React.FC<SeqSetPlotProps> = ({ data, description, barColor }) => {
    const groupedData = groupRemainingPoints(data, 10);
    const { graphData, emptyCount } = getGraphData(groupedData, barColor);

    return <BarPlot data={graphData} description={description} emptyCount={emptyCount} />;
};

export const UseTermsPlot: React.FC<SeqSetPlotProps> = ({ data, description, barColor }) => {
    const { graphData, emptyCount } = getGraphData(data, barColor);
    return <BarPlot data={graphData} description={description} emptyCount={emptyCount} />;
};
