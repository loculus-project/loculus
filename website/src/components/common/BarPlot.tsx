import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    type ChartData,
    type ChartOptions,
} from 'chart.js';
import { type FC, useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';

type BarPlotProps = {
    data: ChartData<'bar'>;
    options?: ChartOptions<'bar'>;
    description?: string;
};

export const BarPlot: FC<BarPlotProps> = ({ data, options, description }) => {
    const [isRegistered, setIsRegistered] = useState(false);

    useEffect(() => {
        ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);
        setIsRegistered(true);
    }, []);

    if (!isRegistered) {
        return null;
    }

    return (
        <div>
            <Bar
                data={data}
                options={{
                    plugins: {
                        title: {
                            display: true,
                        },
                        legend: {
                            display: false,
                        },
                    },
                    scales: {
                        y: {
                            suggestedMax: 10,
                            grid: {
                                color: 'rgba(0, 0, 0, 0)',
                            },
                        },
                    },
                    ...options,
                }}
            />
            {description && (
                <p
                    className={`text-sm text-center text-gray-500 my-4 ml-8 ${options?.responsive === false ? 'w-64' : ''}`}
                >
                    {description}
                </p>
            )}
        </div>
    );
};
