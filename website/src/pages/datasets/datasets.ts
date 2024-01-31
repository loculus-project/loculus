import { DatasetCitationClient } from '../../services/datasetCitationClient.ts';
import type { Dataset } from '../../types/datasets';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader.ts';

const apiClient = DatasetCitationClient.create();

export const getUserCitedBy = (token: string, username: string) => {
    return apiClient.call('getUserCitedBy', {
        params: { username },
        headers: createAuthorizationHeader(token),
    });
};

export const getDatasetCitedBy = (token: string, datasetId: string, version: string) => {
    return apiClient.call('getDatasetCitedBy', {
        params: { datasetId, version },
        headers: createAuthorizationHeader(token),
    });
};

export const getDatasetsOfUser = (token: string) => {
    return apiClient.call('getDatasetsOfUser', {
        headers: createAuthorizationHeader(token),
    });
};

export const getDataset = (token: string, datasetId: string, version: string) => {
    return apiClient.call('getDataset', {
        params: { datasetId, version },
        headers: createAuthorizationHeader(token),
    });
};

export const getDatasetRecords = (token: string, datasetId: string, version: string) => {
    return apiClient.call('getDatasetRecords', {
        params: { datasetId, version },
        headers: createAuthorizationHeader(token),
    });
};

export const getAuthor = (token: string, username: string) => {
    return apiClient.call('getAuthor', {
        params: { username },
        headers: createAuthorizationHeader(token),
    });
};

export const parseAuthorData = (authorResponse: any, userSession: any) => {
    const author = authorResponse !== undefined && authorResponse.length > 0 ? authorResponse[0] : {};
    return {
        name: userSession?.name,
        email: userSession?.email,
        emailVerified: userSession?.email_verified,
        ...author,
    };
};

export const getDatasetByVersion = (datasetVersions: Dataset[], version: string) => {
    const matchedVersion = datasetVersions.find((obj) => {
        return obj.datasetVersion === parseInt(version, 10);
    });
    if (matchedVersion === undefined) {
        return datasetVersions[datasetVersions.length - 1];
    }
    return matchedVersion;
};
