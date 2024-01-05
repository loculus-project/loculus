import { type FC, useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, PointElement, LinearScale, Title, CategoryScale, Tooltip } from 'chart.js';
import type { DatasetCitationResults } from '../../types/datasets';

type CitationPlotProps = {
    citationData: DatasetCitationResults;
};

export const CitationPlot: FC<CitationPlotProps> = ({ citationData }) => {
    const [isRegistered, setIsRegistered] = useState(false);

    useEffect(() => {
        ChartJS.register(LineElement, PointElement, LinearScale, Title, CategoryScale, Tooltip);
        setIsRegistered(true);
    }, []);

    if (!isRegistered) return <></>;

    return (
        <Line
            data={{
                labels: citationData.years,
                datasets: [
                    {
                        data: citationData.citations,
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
            }}
        />
    );
};
