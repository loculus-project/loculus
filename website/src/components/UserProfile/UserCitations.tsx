import CircularProgress from '@mui/material/CircularProgress';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { FC } from 'react';

import type { DatasetCitationResults, ClientConfig } from '../../types';
import { CitationPlot } from '../Datasets/CitationPlot';
import { fetchAuthorCitations } from '../Datasets/api';
import withQueryProvider from '../common/withQueryProvider';

type Props = {
    userId: string;
    clientConfig: ClientConfig;
};

type DateAggCitations = {
    [key: number]: number;
};

const UserCitationsInner: FC<Props> = ({ userId, clientConfig }) => {
    const { data: userCitations, isLoading: isLoadingCitationData }: UseQueryResult = useQuery(
        ['citations', userId],
        () => fetchAuthorCitations(userId, clientConfig),
    );

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

    const citationData = isLoadingCitationData ? null : transformCitationData(userCitations);

    return (
        <div>
            <h1 className='text-2xl font-medium pb-8'>Cited By</h1>
            {isLoadingCitationData ? (
                <CircularProgress />
            ) : (
                <CitationPlot xData={citationData.xData} yData={citationData.yData} />
            )}
        </div>
    );
};

export const UserCitations = withQueryProvider(UserCitationsInner);
