import type { ServiceUrls, Dataset, DatasetRecord, DatasetCitationResults } from '../../types';

const USE_MOCK_API_DATA = true;

const mockUserAggCitations: DatasetCitationResults = {
    years: ['2021', '2022', '2023'],
    citations: [5, 10, 20],
};

const mockDataset = {
    datasetId: 'testDatasetId',
    datasetVersion: 1,
    name: 'Test Dataset',
    description: 'Test Dataset Description',
    createdAt: '2021-01-01',
    createdBy: 'testUser',
};

const mockDatasetRecords = [
    {
        accession: 'id_129663',
        type: 'Pathoplexus',
    },
];

export const fetchAuthorDatasets = async (userId: string, serviceConfig: ServiceUrls): Promise<Dataset[]> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (USE_MOCK_API_DATA) {
        return [mockDataset as unknown as Dataset];
    }

    const response = await fetch(`${serviceConfig.backendUrl}/get-datasets-of-user?username=${userId}`);
    return response.json();
};

export const fetchAuthorCitations = async (
    userId: string,
    serviceConfig: ServiceUrls,
): Promise<DatasetCitationResults> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (USE_MOCK_API_DATA) {
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (USE_MOCK_API_DATA) {
        return [mockDataset as unknown as Dataset];
    }

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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (USE_MOCK_API_DATA) {
        return mockDatasetRecords;
    }

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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (USE_MOCK_API_DATA) {
        return { datasetId: mockDataset.datasetId, datasetVersion: mockDataset.datasetVersion };
    }

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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (USE_MOCK_API_DATA) {
        return { datasetId: mockDataset.datasetId, datasetVersion: mockDataset.datasetVersion };
    }

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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (USE_MOCK_API_DATA) {
        return { status: 200 };
    }

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
