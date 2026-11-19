import { z } from 'zod';

import { apiPath, sendRequest, toFormData, unvalidated } from './apiRequest.ts';
import {
    accessionVersion,
    type AccessionVersionsFilterWithApprovalScope,
    type AccessionVersionsFilterWithDeletionScope,
    type CompleteMultipartUploadRequest,
    currentPipelineVersions,
    dataUseTermsHistoryEntry,
    type EditedSequenceEntryData,
    getSequencesResponse,
    group,
    groupDetails,
    info,
    type NewGroup,
    pipelineVersionStatistics,
    requestMultipartUploadResponse,
    type RevocationRequest,
    sequenceEntryToEdit,
    type SetDataUseTermsRequest,
    submissionIdMapping,
    type SubmitFiles,
    type UploadFiles,
} from '../types/backend.ts';
import {
    type AddSeqSetCitationRequest,
    adminSeqSetCitation,
    adminSeqSetCitations,
    authorProfile,
    type CreateSeqSetRequest,
    seqSetCitations,
    seqSetIdAndVersion,
    type SeqSetRecord,
    seqSets,
    sequenceCitations,
    type UpdateSeqSetRequest,
    type ValidateSeqSetRecordsRequest,
} from '../types/seqSetCitation.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';

export type RequestOptions = { signal?: AbortSignal };

export type GetSequencesQueries = {
    includeReviewData?: boolean;
    /** comma separated list of group ids */
    groupIdsFilter?: string;
    statusesFilter?: string;
    processingResultFilter?: string;
    /** 0-indexed */
    page?: number;
    size?: number;
};

type Organism = { organism: string };
type SeqSetVersion = { seqSetId: string; version: number | string };

/**
 * All endpoints of the Loculus backend.
 *
 * Every endpoint takes a single params object (path parameters plus query parameters or body)
 * and an optional `RequestOptions` object. Endpoints throw on errors, like `sendRequest`.
 *
 * - In the browser, use `useBackendQuery` / `useBackendMutation` from `hooks/useBackend.ts`, or `browserBackendApi()`.
 * - Server-side, use `serverBackendApi()` from `serverApi.ts`, which returns neverthrow `Result`s.
 */
export function backendApi(backendUrl: string, accessToken?: string) {
    const headers = createAuthorizationHeader(accessToken);

    return {
        // ---------------------------------------------------------------- info
        getInfo: (_params?: undefined, { signal }: RequestOptions = {}) =>
            sendRequest(backendUrl, { method: 'get', path: '/', signal, responseSchema: info }),

        // ---------------------------------------------------------------- submission
        getDataToEdit: (
            { organism, accession, version }: Organism & { accession: string; version: number | string },
            { signal }: RequestOptions = {},
        ) =>
            sendRequest(backendUrl, {
                method: 'get',
                path: apiPath`/${organism}/get-data-to-edit/${accession}/${version}`,
                headers,
                signal,
                responseSchema: sequenceEntryToEdit,
            }),

        getSequences: ({ organism, ...params }: Organism & GetSequencesQueries, { signal }: RequestOptions = {}) =>
            sendRequest(backendUrl, {
                method: 'get',
                path: apiPath`/${organism}/get-sequences`,
                params,
                headers,
                signal,
                responseSchema: getSequencesResponse,
            }),

        submit: ({ organism, ...files }: Organism & SubmitFiles) =>
            sendRequest(backendUrl, {
                method: 'post',
                path: apiPath`/${organism}/submit`,
                data: toFormData(files),
                headers,
                responseSchema: z.array(submissionIdMapping),
            }),

        revise: ({ organism, ...files }: Organism & UploadFiles) =>
            sendRequest(backendUrl, {
                method: 'post',
                path: apiPath`/${organism}/revise`,
                data: toFormData(files),
                headers,
                responseSchema: z.array(submissionIdMapping),
            }),

        revoke: ({ organism, ...request }: Organism & RevocationRequest) =>
            sendRequest(backendUrl, {
                method: 'post',
                path: apiPath`/${organism}/revoke`,
                data: request,
                headers,
                responseSchema: z.array(submissionIdMapping),
            }),

        submitEditedData: ({ organism, ...data }: Organism & EditedSequenceEntryData) =>
            sendRequest(backendUrl, {
                method: 'post',
                path: apiPath`/${organism}/submit-edited-data`,
                data,
                headers,
            }),

        approveProcessedData: ({ organism, ...filter }: Organism & AccessionVersionsFilterWithApprovalScope) =>
            sendRequest(backendUrl, {
                method: 'post',
                path: apiPath`/${organism}/approve-processed-data`,
                data: filter,
                headers,
                responseSchema: z.array(accessionVersion),
            }),

        deleteSequenceEntryVersions: ({ organism, ...filter }: Organism & AccessionVersionsFilterWithDeletionScope) =>
            sendRequest(backendUrl, {
                method: 'delete',
                path: apiPath`/${organism}/delete-sequence-entry-versions`,
                data: filter,
                headers,
                responseSchema: z.array(accessionVersion),
            }),

        /** Returns the originally submitted data as a zip file */
        getSubmittedData: ({
            organism,
            ...request
        }: Organism & {
            groupId: number;
            accessionsFilter: string[];
        }) =>
            sendRequest(backendUrl, {
                method: 'post',
                path: apiPath`/${organism}/get-submitted-data`,
                data: request,
                headers,
                responseType: 'blob',
                responseSchema: z.instanceof(Blob),
            }),

        // ---------------------------------------------------------------- data use terms
        getDataUseTermsHistory: ({ accession }: { accession: string }, { signal }: RequestOptions = {}) =>
            sendRequest(backendUrl, {
                method: 'get',
                path: apiPath`/data-use-terms/${accession}`,
                signal,
                responseSchema: z.array(dataUseTermsHistoryEntry),
            }),

        setDataUseTerms: (request: SetDataUseTermsRequest) =>
            sendRequest(backendUrl, { method: 'put', path: '/data-use-terms', data: request, headers }),

        // ---------------------------------------------------------------- groups
        getGroupsOfUser: (_params?: undefined, { signal }: RequestOptions = {}) =>
            sendRequest(backendUrl, {
                method: 'get',
                path: '/user/groups',
                headers,
                signal,
                responseSchema: z.array(group),
            }),

        /** Without a `name`, all groups are returned */
        getGroups: ({ name }: { name?: string } = {}, { signal }: RequestOptions = {}) =>
            sendRequest(backendUrl, {
                method: 'get',
                path: '/groups',
                params: { name },
                headers,
                signal,
                responseSchema: z.array(group),
            }),

        getGroupDetails: ({ groupId }: { groupId: number }, { signal }: RequestOptions = {}) =>
            sendRequest(backendUrl, {
                method: 'get',
                path: apiPath`/groups/${groupId}`,
                headers,
                signal,
                responseSchema: groupDetails,
            }),

        createGroup: (newGroup: NewGroup) =>
            sendRequest(backendUrl, {
                method: 'post',
                path: '/groups',
                data: newGroup,
                headers,
                responseSchema: group,
            }),

        editGroup: ({ groupId, ...newGroup }: NewGroup & { groupId: number }) =>
            sendRequest(backendUrl, {
                method: 'put',
                path: apiPath`/groups/${groupId}`,
                data: newGroup,
                headers,
                responseSchema: group,
            }),

        addUserToGroup: ({ groupId, username }: { groupId: number; username: string }) =>
            sendRequest(backendUrl, { method: 'put', path: apiPath`/groups/${groupId}/users/${username}`, headers }),

        removeUserFromGroup: ({ groupId, username }: { groupId: number; username: string }) =>
            sendRequest(backendUrl, { method: 'delete', path: apiPath`/groups/${groupId}/users/${username}`, headers }),

        // ---------------------------------------------------------------- seqsets
        getSeqSetsOfUser: (_params?: undefined, { signal }: RequestOptions = {}) =>
            sendRequest(backendUrl, {
                method: 'get',
                path: '/get-seqsets-of-user',
                headers,
                signal,
                responseSchema: seqSets,
            }),

        /** Returns all versions of the seqSet */
        getSeqSetVersions: ({ seqSetId }: { seqSetId: string }, { signal }: RequestOptions = {}) =>
            sendRequest(backendUrl, {
                method: 'get',
                path: '/get-seqset',
                params: { seqSetId },
                signal,
                responseSchema: seqSets,
            }),

        getSeqSetRecords: ({ seqSetId, version }: SeqSetVersion, { signal }: RequestOptions = {}) =>
            sendRequest(backendUrl, {
                method: 'get',
                path: '/get-seqset-records',
                params: { seqSetId, version },
                signal,
                // Deliberately not validated: validating a large record list with zod costs hundreds of MB (#7752).
                responseSchema: unvalidated<SeqSetRecord[]>(),
            }),

        getSeqSetCitations: ({ seqSetId, version }: SeqSetVersion, { signal }: RequestOptions = {}) =>
            sendRequest(backendUrl, {
                method: 'get',
                path: '/get-seqset-citations',
                params: { seqSetId, version },
                signal,
                responseSchema: seqSetCitations,
            }),

        /** Returns citations of the accession. Without a `version`, citations of all versions are returned. */
        getSequenceCitations: (
            { accession, version }: { accession: string; version?: number },
            { signal }: RequestOptions = {},
        ) =>
            sendRequest(backendUrl, {
                method: 'get',
                path: '/get-sequence-citations',
                params: { accession, version },
                signal,
                responseSchema: sequenceCitations,
            }),

        getAuthor: ({ username }: { username: string }, { signal }: RequestOptions = {}) =>
            sendRequest(backendUrl, {
                method: 'get',
                path: '/get-author',
                params: { username },
                signal,
                responseSchema: authorProfile,
            }),

        createSeqSet: (request: CreateSeqSetRequest) =>
            sendRequest(backendUrl, {
                method: 'post',
                path: '/create-seqset',
                data: request,
                headers,
                responseSchema: seqSetIdAndVersion,
            }),

        updateSeqSet: (request: UpdateSeqSetRequest) =>
            sendRequest(backendUrl, {
                method: 'put',
                path: '/update-seqset',
                data: request,
                headers,
                responseSchema: seqSetIdAndVersion,
            }),

        validateSeqSetRecords: (records: ValidateSeqSetRecordsRequest) =>
            sendRequest(backendUrl, {
                method: 'post',
                path: '/validate-seqset-records',
                data: records,
                headers,
                responseSchema: z.object({ valid: z.boolean() }),
            }),

        createSeqSetDOI: ({ seqSetId, version }: SeqSetVersion) =>
            sendRequest(backendUrl, {
                method: 'post',
                path: '/create-seqset-doi',
                params: { seqSetId, version },
                headers,
                responseSchema: seqSetIdAndVersion,
            }),

        deleteSeqSet: ({ seqSetId, version }: SeqSetVersion) =>
            sendRequest(backendUrl, {
                method: 'delete',
                path: '/delete-seqset',
                params: { seqSetId, version },
                headers,
            }),

        // ---------------------------------------------------------------- files
        /** Request presigned URLs for multipart upload: `numberFiles` file IDs with `numberParts` URLs each */
        requestMultipartUpload: (params: { groupId: number; numberFiles: number; numberParts: number }) =>
            sendRequest(backendUrl, {
                method: 'post',
                path: '/files/request-multipart-upload',
                params,
                headers,
                responseSchema: requestMultipartUploadResponse,
            }),

        /** Complete multipart uploads by providing the ETags of all parts */
        completeMultipartUpload: (fileIdsAndEtags: CompleteMultipartUploadRequest) =>
            sendRequest(backendUrl, {
                method: 'post',
                path: '/files/complete-multipart-upload',
                data: fileIdsAndEtags,
                headers,
            }),

        // ---------------------------------------------------------------- admin
        getPipelineStatistics: (_params?: undefined, { signal }: RequestOptions = {}) =>
            sendRequest(backendUrl, {
                method: 'get',
                path: '/admin/pipeline-statistics',
                headers,
                signal,
                responseSchema: pipelineVersionStatistics,
            }),

        getCurrentPipelineVersions: (_params?: undefined, { signal }: RequestOptions = {}) =>
            sendRequest(backendUrl, {
                method: 'get',
                path: '/admin/current-pipeline-versions',
                headers,
                signal,
                responseSchema: currentPipelineVersions,
            }),

        getAllSeqSetCitations: (_params?: undefined, { signal }: RequestOptions = {}) =>
            sendRequest(backendUrl, {
                method: 'get',
                path: '/admin/get-all-seqset-citations',
                headers,
                signal,
                responseSchema: adminSeqSetCitations,
            }),

        addSeqSetCitation: (request: AddSeqSetCitationRequest) =>
            sendRequest(backendUrl, {
                method: 'post',
                path: '/admin/add-seqset-citation',
                data: request,
                headers,
                responseSchema: adminSeqSetCitation,
            }),

        deleteSeqSetCitation: ({ sourceDOI }: { sourceDOI: string }) =>
            sendRequest(backendUrl, {
                method: 'delete',
                path: '/admin/delete-seqset-citation',
                params: { sourceDOI },
                headers,
            }),
    };
}

export type BackendApi = ReturnType<typeof backendApi>;

/** Website route that proxies requests to the backend, see `pages/api/backend/[...path].ts` */
export const BACKEND_PROXY_PATH = '/api/backend';

/**
 * The backend API for client-side code. Requests go through the website's backend proxy,
 * which adds the access token from the session cookie, so client-side code never sees the token.
 */
export function browserBackendApi() {
    return backendApi(BACKEND_PROXY_PATH);
}
