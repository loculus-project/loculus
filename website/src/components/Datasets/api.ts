import { mockDatasets, mockDatasetAggCitations, mockUserAggCitations } from './mockData';
import type { ServiceUrls, Dataset } from '../../types';

const USE_MOCK_DATA = true;

export const fetchAuthorDatasets = async (userId: string, serviceConfig: ServiceUrls): Promise<any> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (USE_MOCK_DATA) {
        return mockDatasets;
    }
    const response = await fetch(`${serviceConfig.backendUrl}/user/datasets/${userId}`);
    return (await response.json()).data;
};

export const fetchAuthorMetadata = async (userId: string, serviceConfig: ServiceUrls): Promise<any> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (USE_MOCK_DATA) {
        return {};
    }
    const response = await fetch(`${serviceConfig.backendUrl}/read-author?authorId=${userId}`);
    return (await response.json()).data;
};

export const fetchAuthorCitations = async (userId: string, serviceConfig: ServiceUrls): Promise<any> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (USE_MOCK_DATA) {
        return mockUserAggCitations;
    }
    const response = await fetch(`${serviceConfig.backendUrl}/user/citations/${userId}`);
    return (await response.json()).data;
};

export const fetchDataset = async (datasetId: string, serviceConfig: ServiceUrls): Promise<any> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (USE_MOCK_DATA) {
        return mockDatasets.find((dataset) => dataset.datasetId === datasetId);
    }

    const response = await fetch(`${serviceConfig.backendUrl}/read-bibliography?bibliographyId=${datasetId}`);
    return (await response.json()).data;
};

export const createDataset = async (dataset: Dataset, serviceUrls: ServiceUrls): Promise<any> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (USE_MOCK_DATA) {
        return {
            datasetId: '45FXCV1XV82ha29uBaGbRh',
            status: 200,
        };
    }
    const body = JSON.stringify({
        dataset,
    });
    const response = await fetch(`${serviceUrls.backendUrl}/create-bibliography`, {
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

export const updateDataset = async (datasetId: string, dataset: Dataset, serviceUrls: ServiceUrls): Promise<any> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (USE_MOCK_DATA) {
        return {
            datasetId: '45FXCV1XV82ha29uBaGbRh',
            status: 200,
        };
    }

    const body = JSON.stringify({
        datasetId,
        dataset,
    });
    const response = await fetch(`${serviceUrls.backendUrl}/update-bibliography}`, {
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

export const deleteDataset = async (datasetId: string, serviceUrls: ServiceUrls): Promise<any> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (USE_MOCK_DATA) {
        return {
            datasetId: '45FXCV1XV82ha29uBaGbRh',
            status: 200,
        };
    }

    const body = JSON.stringify({
        datasetId,
    });
    const response = await fetch(`${serviceUrls.backendUrl}/delete-bibliography}`, {
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

export const fetchCitation = async (citationId: string, serviceConfig: ServiceUrls): Promise<any> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (USE_MOCK_DATA) {
        return mockDatasetAggCitations.find((citation) => citation.citationId === citationId);
    }

    const response = await fetch(`${serviceConfig.backendUrl}/read-citation?citationId=${citationId}`);
    return (await response.json()).data;
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
