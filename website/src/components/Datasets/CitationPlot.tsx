import { BarChart } from '@mui/x-charts/BarChart';
import type { FC } from 'react';

type CitationPlotProps = {
    xData: number[];
    yData: number[];
};

export const CitationPlot: FC<CitationPlotProps> = ({ xData, yData }) => {
    const getSequentialXData = () => {
        const minYear = Math.min(...xData);
        const maxYear = Math.max(...xData);
        const xSeq = [];
        for (let i = minYear; i <= maxYear; i++) {
            xSeq.push(i);
        }
        return xSeq.map((year) => year.toString());
    };

    const getSequentialYData = () => {
        const xSeq = getSequentialXData();
        const ySeq = Array(xSeq.length).fill(0);
        for (const [i, v] of xSeq.entries()) {
            const numericYear = parseInt(v, 10);
            if (xData.includes(numericYear)) {
                ySeq[i] = yData[xData.indexOf(numericYear)];
            }
        }
        return ySeq;
    };

    return (
        <BarChart
            xAxis={[
                {
                    id: 'citationDates',
                    data: getSequentialXData(),
                    scaleType: 'band',
                },
            ]}
            series={[
                {
                    data: getSequentialYData(),
                    color: '#54858c',
                },
            ]}
            height={200}
            margin={{ top: 8, left: 32, right: 8 }}
        />
    );
};
