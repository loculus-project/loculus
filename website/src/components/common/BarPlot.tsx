import 'chartjs-adapter-date-fns';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    TimeScale,
    BarElement,
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
        ChartJS.register(CategoryScale, LinearScale, TimeScale, BarElement, Tooltip, Legend);
        setIsRegistered(true);
    }, []);

    if (!isRegistered)
        return (
            <div className='flex items-center justify-center h-48'>
                <div className='loading loading-spinner' />
            </div>
        );

    return (
        <div>
            <Bar
                data={data}
                options={{
                    devicePixelRatio: 2,
                    plugins: {
                        legend: {
                            display: false,
                        },
                    },
                    scales: {
                        x: {
                            grid: {
                                color: 'rgba(0, 0, 0, 0)',
                            },
                        },
                    },
                    ...options,
                }}
            />
            {description && <p className={`text-sm text-center ml-6 mt-3 text-gray-500`}>{description}</p>}
        </div>
    );
};
