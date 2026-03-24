import React from 'react';

import { SEQSET_GRAPHS_COLOUR, type CitedByResult } from '../../types/seqSetCitation';
import { BarPlot } from '../common/BarPlot';

type CitationPlotProps = {
    citedByData: CitedByResult;
    description?: string;
};

export const CitationPlot: React.FC<CitationPlotProps> = ({ citedByData, description }) => {
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
                        backgroundColor: SEQSET_GRAPHS_COLOUR,
                    },
                ],
            }}
            options={{
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(0, 0, 0, 0)',
                        },
                    },
                    y: {
                        suggestedMax: 10,
                    },
                },
            }}
            description={description}
        />
    );
};
