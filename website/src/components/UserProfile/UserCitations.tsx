import { type FC, useState, useEffect } from 'react';

import { CitationPlot } from '../Datasets/CitationPlot';
import { mockUserCitations } from '../Datasets/mockData';
import type { DatasetCitationResults } from '../../types';

type Props = {
    username?: string;
};

type DateAggCitations = {
    [key: number]: number;
};

export const UserCitations: FC<Props> = ({ username }) => {
    const [userCitations, setUserCitations] = useState<DatasetCitationResults | {}>(mockUserCitations);

    useEffect(() => {
        const fetchUserCitations = () => {
            // TODO: fetch user citations
            return username;
        };
        fetchUserCitations();
        setUserCitations(mockUserCitations);
    }, [username]);

    const transformCitationData = (citationData: DatasetCitationResults[]) => {
        const yearCounts: DateAggCitations = {};

        citationData.forEach((citationData) => {
            citationData.citations.forEach((citation) => {
                const year = new Date(citation.date).getFullYear();
                if (!yearCounts[year]) {
                    yearCounts[year] = 0;
                }
                yearCounts[year]++;
            });
        });

        const xData = Object.keys(yearCounts).map((year) => parseInt(year, 10));
        const yData = Object.values(yearCounts);

        xData.sort();
        yData.sort((a, b) => xData.indexOf(a) - xData.indexOf(b));

        return {
            xData,
            yData,
        };
    };

    const citationData = transformCitationData(userCitations);

    return (
        <div>
            <h1 className='text-2xl font-medium pb-8'>Cited By</h1>
            <CitationPlot xData={citationData.xData} yData={citationData.yData} />
        </div>
    );
};
