import { mockDatasetAggCitations, mockUserAggCitations } from './mockData';
import type { ServiceUrls, Dataset, DatasetRecord, DatasetCitationResults } from '../../types';

const USE_MOCK_DATA = true;

export const fetchAuthorDatasets = async (userId: string, serviceConfig: ServiceUrls): Promise<Dataset[]> => {
    const response = await fetch(`${serviceConfig.backendUrl}/get-datasets-of-user?username=${userId}`);
    return response.json();
};

export const fetchAuthorMetadata = async (userId: string, serviceConfig: ServiceUrls): Promise<any> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (USE_MOCK_DATA) {
        return {};
    }
    const response = await fetch(`${serviceConfig.backendUrl}/read-author?authorId=${userId}`);
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
    const response = await fetch(`${serviceConfig.backendUrl}/user/citations/${userId}`);
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

export const fetchCitation = async (citationId: string, serviceConfig: ServiceUrls): Promise<any> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (USE_MOCK_DATA) {
        return mockDatasetAggCitations.find((citation) => citation.citationId === citationId);
    }

    const response = await fetch(`${serviceConfig.backendUrl}/read-citation?citationId=${citationId}`);
    return response.json();
};

export const createCitation = async (citation: any, serviceUrls: ServiceUrls): Promise<any> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (USE_MOCK_DATA) {
        return {
            citationId: 'mockCitationId',
            status: 200,
        };
    }

    const body = JSON.stringify({
        citation,
    });
    const response = await fetch(`${serviceUrls.backendUrl}/create-citation`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body,
    });

    if (!response.ok) {
        throw new Error(`Unexpected response: ${response.statusText}`);
    }
    return response;
};

export const updateCitation = async (citationId: string, citation: any, serviceUrls: ServiceUrls): Promise<any> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (USE_MOCK_DATA) {
        return {
            citationId: 'mockCitationId',
            status: 200,
        };
    }

    const body = JSON.stringify({
        citationId,
        citation,
    });
    const response = await fetch(`${serviceUrls.backendUrl}/update-citation}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body,
    });

    if (!response.ok) {
        throw new Error(`Unexpected response: ${response.statusText}`);
    }
    return response;
};

export const deleteCitation = async (citationId: string, serviceUrls: ServiceUrls): Promise<any> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (USE_MOCK_DATA) {
        return {
            citationId: 'mockCitationId',
            status: 200,
        };
    }

    const body = JSON.stringify({
        citationId,
    });
    const response = await fetch(`${serviceUrls.backendUrl}/delete-citation}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body,
    });

    if (!response.ok) {
        throw new Error(`Unexpected response: ${response.statusText}`);
    }
    return response;
};
