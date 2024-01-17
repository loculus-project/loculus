import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { type FC, useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';

// import { Chart as ChartJS, LineElement, PointElement, LinearScale, Title, CategoryScale, Tooltip } from 'chart.js';
import type { CitedByResult } from '../../types/datasets';

type CitationPlotProps = {
    citedByData: CitedByResult;
};

export const CitationPlot: FC<CitationPlotProps> = ({ citedByData }) => {
    const [isRegistered, setIsRegistered] = useState(false);

    useEffect(() => {
        // ChartJS.register(LineElement, PointElement, LinearScale, Title, CategoryScale, Tooltip);
        ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);
        setIsRegistered(true);
    }, []);
    if (!isRegistered) return null;

    const emptyCitedByData = {
        years: [2020, 2021, 2022, 2023, 2024],
        citations: [0, 0, 0, 0, 0],
    };

    const renderData = citedByData !== undefined && citedByData?.years?.length > 0 ? citedByData : emptyCitedByData;

    return (
        <Bar
            data={{
                labels: renderData.years,
                datasets: [
                    {
                        data: renderData.citations,
                        label: 'Citation count',
                        backgroundColor: '#54858c',
                    },
                ],
            }}
            options={{
                maintainAspectRatio: false,
                responsive: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Dataset Citations by Year',
                    },
                    legend: {
                        display: false,
                    },
                },
                scales: {
                    y: {
                        suggestedMax: 10,
                    },
                },
            }}
        />
    );
};
