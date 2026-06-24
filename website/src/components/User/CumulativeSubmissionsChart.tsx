import { Chart as ChartJS, TimeScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { type FC, useMemo } from 'react';
import { Line } from 'react-chartjs-2';

import type { Organism } from '../../config.ts';
import { Spinner } from '../common/Spinner';

ChartJS.register(TimeScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// Padding applied to the x-axis when every submission falls on a single date,
// so the lone point isn't rendered on a zero-width time axis.
const SINGLE_POINT_PADDING_MS = 15 * 24 * 60 * 60 * 1000;

// Parse a metadata date string ('2024', '2024-03' or '2024-03-15') into a
// local-midnight timestamp. Local (rather than UTC) avoids the rendered date
// shifting by a day in negative-offset timezones. Returns null if unparseable.
function parseDateToLocalTs(dateStr: string): number | null {
    const parts = dateStr.split('-');
    const year = Number(parts[0]);
    const month = parts.length > 1 ? Number(parts[1]) - 1 : 0;
    const day = parts.length > 2 ? Number(parts[2]) : 1;
    if (!Number.isInteger(year) || Number.isNaN(month) || Number.isNaN(day)) {
        return null;
    }
    const timestamp = new Date(year, month, day).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
}

export type TimeSeriesDataPoint = {
    date: string;
    count: number;
};

export type TimeSeriesData = Record<string, TimeSeriesDataPoint[]>;

// Note: Colors will repeat if there are more than 8 organisms
const ORGANISM_COLORS = ['#54858c', '#e6a756', '#7b68a6', '#5aa469', '#d4776b', '#4a90a4', '#9b8b6e', '#c97b84'];

type CumulativeSubmissionsChartProps = {
    timeSeriesData: TimeSeriesData;
    organisms: Organism[];
    isLoading: boolean;
};

export const CumulativeSubmissionsChart: FC<CumulativeSubmissionsChartProps> = ({
    timeSeriesData,
    organisms,
    isLoading,
}) => {
    const { chartData, xBounds } = useMemo(() => {
        const datasets = organisms
            .map((organism, index) => {
                const data = [...(timeSeriesData[organism.key] ?? [])].sort((a, b) => a.date.localeCompare(b.date));

                let cumulative = 0;
                const points: { x: number; y: number }[] = [];
                for (const point of data) {
                    const timestamp = parseDateToLocalTs(point.date);
                    if (timestamp === null) {
                        continue;
                    }
                    cumulative += point.count;
                    points.push({ x: timestamp, y: cumulative });
                }

                return {
                    label: organism.displayName,
                    data: points,
                    borderColor: ORGANISM_COLORS[index % ORGANISM_COLORS.length],
                    backgroundColor: ORGANISM_COLORS[index % ORGANISM_COLORS.length],
                    borderWidth: 1.5,
                    // Cumulative counts only change on dates with submissions, so a
                    // step ('before') line is more faithful than linear interpolation:
                    // the total stays flat and jumps up exactly on each release date.
                    stepped: 'before' as const,
                    fill: false,
                    // Show a marker on every data point so individual submission dates
                    // are visible — in particular a group with a single submission
                    // would otherwise render an invisible zero-length line.
                    pointRadius: 3,
                    pointHoverRadius: 5,
                };
            })
            .filter((ds) => ds.data.length > 0 && ds.data[ds.data.length - 1].y > 0);

        // Determine x-axis bounds. When all submissions share a single date the
        // time axis would otherwise collapse to zero width, so pad either side.
        const allTimestamps = datasets.flatMap((ds) => ds.data.map((p) => p.x));
        let bounds: { min: number; max: number } | undefined;
        if (allTimestamps.length > 0) {
            const min = Math.min(...allTimestamps);
            const max = Math.max(...allTimestamps);
            if (min === max) {
                bounds = { min: min - SINGLE_POINT_PADDING_MS, max: max + SINGLE_POINT_PADDING_MS };
            }
        }

        return { chartData: { datasets }, xBounds: bounds };
    }, [timeSeriesData, organisms]);

    if (isLoading) {
        return (
            <div className='flex justify-center items-center h-64'>
                <Spinner size='lg' />
            </div>
        );
    }

    if (chartData.datasets.length === 0) {
        return <p className='text-gray-500 text-center py-8'>No submission data available</p>;
    }

    return (
        <div className='h-64'>
            <Line
                data={chartData}
                options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        title: {
                            display: false,
                        },
                    },
                    scales: {
                        x: {
                            type: 'time',
                            min: xBounds?.min,
                            max: xBounds?.max,
                            time: {
                                tooltipFormat: 'yyyy-MM-dd',
                            },
                            title: {
                                display: true,
                                text: 'Release date',
                            },
                            ticks: {
                                maxTicksLimit: 10,
                            },
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Cumulative submissions',
                            },
                            beginAtZero: true,
                            // Cumulative submission counts are whole numbers, so
                            // never label the y-axis with fractional values.
                            ticks: {
                                precision: 0,
                            },
                        },
                    },
                }}
            />
        </div>
    );
};
