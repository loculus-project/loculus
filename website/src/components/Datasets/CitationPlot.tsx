import { BarChart } from '@mui/x-charts/BarChart';
import type { FC } from 'react';

import type { DatasetCitationResults } from '../../types';

type CitationPlotProps = {
    citationData: DatasetCitationResults;
};

export const CitationPlot: FC<CitationPlotProps> = ({ citationData }) => {
    return (
        <BarChart
            xAxis={[
                {
                    id: 'citationDates',
                    data: citationData.years,
                    scaleType: 'band',
                },
            ]}
            series={[
                {
                    data: citationData.citations,
                    color: '#54858c',
                },
            ]}
            height={200}
            margin={{ top: 8, left: 32, right: 8 }}
        />
    );
};
