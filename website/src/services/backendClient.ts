import { z } from 'zod';

import { ApiClient, type ApiClientLogger } from './apiClient.ts';
import { apiPath } from './apiRequest.ts';
import {
    dataUseTermsHistoryEntry,
    getSequencesResponse,
    info,
    requestMultipartUploadResponse,
    sequenceEntryToEdit,
    pipelineVersionStatistics,
    currentPipelineVersions,
    type CompleteMultipartUploadRequest,
} from '../types/backend.ts';
import { adminSeqSetCitation, adminSeqSetCitations, type AddSeqSetCitationRequest } from '../types/seqSetCitation.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';

type GetSequencesParameters = {
    groupIdsFilter?: string | undefined;
    statusesFilter?: string | undefined;
    processingResultFilter?: string | undefined;
    page?: number | undefined;
    size?: number | undefined;
};

/**
 * Client for the Loculus backend, usable both server-side and in the browser.
 * Server-side code should use `createBackendClient()` from `backendClientFactory.ts`;
 * browser code should pass a `ClientLogger` (see `getClientLogger`).
 */
export class BackendClient extends ApiClient {
    constructor(backendUrl: string, logger: ApiClientLogger) {
        super(backendUrl, (responseData) => responseData, logger, 'backend');
    }

    public getDataToEdit(organism: string, token: string, accession: string, version: string | number) {
        return this.request({
            method: 'get',
            path: apiPath`/${organism}/get-data-to-edit/${accession}/${version}`,
            headers: createAuthorizationHeader(token),
            responseSchema: sequenceEntryToEdit,
        });
    }

    public getDataUseTermsHistory(accession: string) {
        return this.request({
            method: 'get',
            path: apiPath`/data-use-terms/${accession}`,
            responseSchema: z.array(dataUseTermsHistoryEntry),
        });
    }

    public getSequences(token: string, organism: string, params: GetSequencesParameters) {
        return this.request({
            method: 'get',
            path: apiPath`/${organism}/get-sequences`,
            params,
            headers: createAuthorizationHeader(token),
            responseSchema: getSequencesResponse,
        });
    }

    /**
     * Request presigned URLs for multipart file upload.
     * @param token The bearer token.
     * @param groupId The group ID of the group that will own the uploaded files.
     * @param numberFiles How many file IDs and URLs to generate.
     * @param numberParts How many parts per file.
     * @returns A list of file IDs with lists of presigned URLs for each part.
     */
    public requestMultipartUpload(token: string, groupId: number, numberFiles: number, numberParts: number) {
        return this.request({
            method: 'post',
            path: '/files/request-multipart-upload',
            params: { groupId, numberFiles, numberParts },
            headers: createAuthorizationHeader(token),
            responseSchema: requestMultipartUploadResponse,
        });
    }

    /**
     * Complete multipart uploads by providing ETags for all parts.
     * @param token The bearer token.
     * @param fileIdsAndEtags List of file IDs with their corresponding ETags.
     */
    public completeMultipartUpload(token: string, fileIdsAndEtags: CompleteMultipartUploadRequest) {
        return this.request({
            method: 'post',
            path: '/files/complete-multipart-upload',
            data: fileIdsAndEtags,
            headers: createAuthorizationHeader(token),
            responseSchema: z.unknown(),
        });
    }

    public async isInDebugMode() {
        const infoResponse = await this.request({ method: 'get', path: '/', responseSchema: info });
        return infoResponse.match(
            (info) => info.isInDebugMode,
            () => false,
        );
    }

    public getPipelineStatistics(token: string) {
        return this.request({
            method: 'get',
            path: '/admin/pipeline-statistics',
            headers: createAuthorizationHeader(token),
            responseSchema: pipelineVersionStatistics,
        });
    }

    public getCurrentPipelineVersions(token: string) {
        return this.request({
            method: 'get',
            path: '/admin/current-pipeline-versions',
            headers: createAuthorizationHeader(token),
            responseSchema: currentPipelineVersions,
        });
    }

    public getAllSeqSetCitations(token: string) {
        return this.request({
            method: 'get',
            path: '/admin/get-all-seqset-citations',
            headers: createAuthorizationHeader(token),
            responseSchema: adminSeqSetCitations,
        });
    }

    public addSeqSetCitation(token: string, request: AddSeqSetCitationRequest) {
        return this.request({
            method: 'post',
            path: '/admin/add-seqset-citation',
            data: request,
            headers: createAuthorizationHeader(token),
            responseSchema: adminSeqSetCitation,
        });
    }

    public deleteSeqSetCitation(token: string, sourceDOI: string) {
        return this.request({
            method: 'delete',
            path: '/admin/delete-seqset-citation',
            params: { sourceDOI },
            headers: createAuthorizationHeader(token),
            responseSchema: z.unknown(),
        });
    }
}
