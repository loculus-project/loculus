import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { type FC, useMemo } from 'react';
import { Line } from 'react-chartjs-2';

import type { Organism } from '../../config.ts';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

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
    const chartData = useMemo(() => {
        const allDates = new Set<string>();
        for (const organism of organisms) {
            const data = timeSeriesData[organism.key] ?? [];
            for (const point of data) {
                allDates.add(point.date);
            }
        }
        const sortedDates = Array.from(allDates).sort();

        if (sortedDates.length === 0) {
            return { labels: [], datasets: [] };
        }

        const datasets = organisms.map((organism, index) => {
            const data = timeSeriesData[organism.key] ?? [];
            const dateToCount = new Map(data.map((d) => [d.date, d.count]));

            let cumulative = 0;
            const cumulativeData = sortedDates.map((date) => {
                cumulative += dateToCount.get(date) ?? 0;
                return cumulative;
            });

            return {
                label: organism.displayName,
                data: cumulativeData,
                borderColor: ORGANISM_COLORS[index % ORGANISM_COLORS.length],
                backgroundColor: ORGANISM_COLORS[index % ORGANISM_COLORS.length],
                borderWidth: 1.5,
                tension: 0.1,
                fill: false,
                pointRadius: 0,
            };
        });

        return {
            labels: sortedDates,
            datasets: datasets.filter((ds) => ds.data[ds.data.length - 1] > 0),
        };
    }, [timeSeriesData, organisms]);

    if (isLoading) {
        return (
            <div className='flex justify-center items-center h-64'>
                <span className='loading loading-spinner loading-lg'></span>
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
                        },
                    },
                }}
            />
        </div>
    );
};
