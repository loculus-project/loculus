import type { ServiceUrls, DatasetCitationResults } from '../../types';

const USE_MOCK_DATA = true;

export const mockUserAggCitations = [
    {
        sequenceId: 'sequenceId1',
        citations: [
            {
                datasetId: 'datasetId1',
                date: '2023-01-01',
            },
            {
                datasetId: 'datasetId2',
                date: '2022-01-01',
            },
        ],
    },
    {
        sequenceId: 'sequenceId2',
        citations: [
            {
                datasetId: 'datasetId3',
                date: '2023-01-01',
            },
            {
                datasetId: 'datasetId4',
                date: '2021-01-01',
            },
        ],
    },
    {
        sequenceId: 'sequenceId3',
        citations: [
            {
                datasetId: 'datasetId5',
                date: '2023-01-01',
            },
            {
                datasetId: 'datasetId6',
                date: '2021-01-01',
            },
        ],
    },
];

export const fetchAuthorCitations = async (
    userId: string,
    serviceConfig: ServiceUrls,
): Promise<DatasetCitationResults[]> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (USE_MOCK_DATA) {
        return mockUserAggCitations;
    }
    const response = await fetch(`${serviceConfig.backendUrl}/get-citations-of-user?username=${userId}`);
    return response.json();
};
