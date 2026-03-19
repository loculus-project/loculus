import React from 'react';

import type { CitedByResult } from '../../types/seqSetCitation';
import { BarPlot } from '../common/BarPlot';

type CitationPlotProps = {
    citedByData: CitedByResult;
    responsive?: boolean;
    description?: string;
};

export const CitationPlot: React.FC<CitationPlotProps> = ({ citedByData, responsive, description }) => {
    const emptyCitedByData = {
        years: [2020, 2021, 2022, 2023, 2024],
        citations: [0, 0, 0, 0, 0],
    };

    const renderData = citedByData.years.length > 0 ? citedByData : emptyCitedByData;

    return (
        <BarPlot
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
                responsive: responsive ?? true,
            }}
            description={description}
        />
    );
};
