import { type FC, useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, PointElement, LinearScale, Title, CategoryScale, Tooltip } from 'chart.js';
import type { CitedByResult } from '../../types/datasets';

type CitationPlotProps = {
    citedByData: CitedByResult;
};

export const CitationPlot: FC<CitationPlotProps> = ({ citedByData = [] }) => {
    const [isRegistered, setIsRegistered] = useState(false);

    useEffect(() => {
        ChartJS.register(LineElement, PointElement, LinearScale, Title, CategoryScale, Tooltip);
        setIsRegistered(true);
    }, []);
    if (!isRegistered) return <></>;

    const fallbackCitedByData = {
        years: [2019, 2020, 2021, 2022, 2023],
        citations: [0, 0, 0, 0, 0],
    }

    const renderData = citedByData?.years?.length > 0 ? citedByData : fallbackCitedByData
    
    return (
        <Line
            data={{
                labels: renderData.years,
                datasets: [
                    {
                        data: renderData.citations,
                        label: 'Citation count',
                        borderColor: '#54858c',
                        fill: false,
                    },
                ],
            }}
            options={{
                responsive: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Citations by Year',
                    },
                    legend: {
                        display: false,
                    },
                },
                scales: {
                    yAxes: [{
                        display: true,
                        ticks: {
                            min: 0,
                            suggestedMin: 0,
                            beginAtZero: true,
                        }
                    }]
                }
            }}
        />
    );
};
