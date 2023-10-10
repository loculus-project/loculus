import type { ServiceUrls, Dataset, DatasetRecord, DatasetCitationResults } from '../../types';

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

export const fetchAuthorDatasets = async (userId: string, serviceConfig: ServiceUrls): Promise<Dataset[]> => {
    const response = await fetch(`${serviceConfig.backendUrl}/get-datasets-of-user?username=${userId}`);
    return response.json();
};

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

export const fetchDataset = async (
    datasetId: string,
    datasetVersion: string,
    serviceConfig: ServiceUrls,
): Promise<Dataset[]> => {
    const response = await fetch(
        `${serviceConfig.backendUrl}/get-dataset?datasetId=${datasetId}&version=${datasetVersion}`,
    );
    return response.json();
};

export const fetchDatasetRecords = async (
    datasetId: string,
    datasetVersion: string,
    serviceConfig: ServiceUrls,
): Promise<DatasetRecord[]> => {
    const response = await fetch(
        `${serviceConfig.backendUrl}/get-dataset-records?datasetId=${datasetId}&version=${datasetVersion}`,
    );
    return response.json();
};

export const createDataset = async (
    userId: string,
    dataset: Partial<Dataset>,
    serviceUrls: ServiceUrls,
): Promise<any> => {
    const body = JSON.stringify(dataset);
    const response = await fetch(`${serviceUrls.backendUrl}/create-dataset?username=${userId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body,
    });

    if (!response.ok) {
        throw new Error(`Unexpected response: ${response.statusText}`);
    }
    return response.json();
};

export const updateDataset = async (
    userId: string,
    datasetId: string,
    dataset: Partial<Dataset>,
    serviceUrls: ServiceUrls,
): Promise<any> => {
    const body = JSON.stringify(dataset);
    const response = await fetch(`${serviceUrls.backendUrl}/update-dataset?username=${userId}&datasetId=${datasetId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body,
    });

    if (!response.ok) {
        throw new Error(`Unexpected response: ${response.statusText}`);
    }
    return response.json();
};

export const deleteDataset = async (
    userId: string,
    datasetId: string,
    datasetVersion: string,
    serviceUrls: ServiceUrls,
): Promise<any> => {
    const response = await fetch(
        `${serviceUrls.backendUrl}/delete-dataset?username=${userId}&datasetId=${datasetId}&version=${datasetVersion}`,
        {
            method: 'DELETE',
        },
    );

    if (!response.ok) {
        throw new Error(`Unexpected response: ${response.statusText}`);
    }
    return response;
};
