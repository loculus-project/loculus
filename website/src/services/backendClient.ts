import { err, ok, type Result } from 'neverthrow';
import type { z } from 'zod';

import {
    type BackendApiClient,
    createBackendApiClient,
    type FetchResult,
    isBackendApiError,
    unwrapBackendResponse,
} from './backend/backendApiClient.ts';
import {
    type CompleteMultipartUploadRequest,
    type CurrentPipelineVersions,
    type DataUseTermsHistoryEntry,
    getSequencesResponse,
    type GetSequencesResponse,
    info,
    type PipelineVersionStatistics,
    type ProblemDetail,
    type RequestMultipartUploadResponse,
    type SequenceEntryStatusNames,
    type SequenceEntryProcessingResultNames,
    sequenceEntryToEdit,
    type SequenceEntryToEdit,
} from '../types/backend.ts';
import type { AddSeqSetCitationRequest, AdminSeqSetCitation } from '../types/seqSetCitation.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';

type GetSequencesParameters = {
    groupIdsFilter?: number[];
    statusesFilter?: SequenceEntryStatusNames[];
    processingResultFilter?: SequenceEntryProcessingResultNames[];
    page?: number;
    size?: number;
};

/**
 * Backend client returning `Result`s, for Astro pages and for components that call the backend imperatively.
 * React components that fetch data should prefer the react-query hooks in `./backend/backendHooks.ts`.
 */
export class BackendClient {
    private readonly client: BackendApiClient;

    constructor(private readonly url: string) {
        this.client = createBackendApiClient(url);
    }

    public getDataToEdit(
        organism: string,
        token: string,
        accession: string,
        version: string | number,
    ): Promise<Result<SequenceEntryToEdit, ProblemDetail>> {
        return this.request(
            this.client.GET('/{organism}/get-data-to-edit/{accession}/{version}', {
                params: { path: { organism, accession, version: Number(version) } },
                headers: createAuthorizationHeader(token),
            }),
            sequenceEntryToEdit,
        );
    }

    public getDataUseTermsHistory(accession: string): Promise<Result<DataUseTermsHistoryEntry[], ProblemDetail>> {
        return this.request(
            this.client.GET('/data-use-terms/{accession}', {
                params: { path: { accession } },
            }),
        );
    }

    public getSequences(
        token: string,
        organism: string,
        params: GetSequencesParameters,
    ): Promise<Result<GetSequencesResponse, ProblemDetail>> {
        return this.request(
            this.client.GET('/{organism}/get-sequences', {
                params: { path: { organism }, query: params },
                headers: createAuthorizationHeader(token),
            }),
            getSequencesResponse,
        );
    }

    /**
     * Request presigned URLs for multipart file upload.
     * @param token The bearer token.
     * @param groupId The group ID of the group that will own the uploaded files.
     * @param numberFiles How many file IDs and URLs to generate.
     * @param numberParts How many parts per file.
     * @returns A list of file IDs with lists of presigned URLs for each part.
     */
    public requestMultipartUpload(
        token: string,
        groupId: number,
        numberFiles: number,
        numberParts: number,
    ): Promise<Result<RequestMultipartUploadResponse, ProblemDetail>> {
        return this.request(
            this.client.POST('/files/request-multipart-upload', {
                params: { query: { groupId, numberFiles, numberParts } },
                headers: createAuthorizationHeader(token),
            }),
        );
    }

    /**
     * Complete multipart uploads by providing ETags for all parts.
     * @param token The bearer token.
     * @param fileIdsAndEtags List of file IDs with their corresponding ETags.
     */
    public completeMultipartUpload(
        token: string,
        fileIdsAndEtags: CompleteMultipartUploadRequest,
    ): Promise<Result<unknown, ProblemDetail>> {
        return this.request(
            this.client.POST('/files/complete-multipart-upload', {
                body: fileIdsAndEtags,
                headers: createAuthorizationHeader(token),
            }),
        );
    }

    /**
     * The info endpoint (`/`) is hidden from the OpenAPI spec, so it's called with plain fetch.
     */
    public async isInDebugMode() {
        try {
            const response = await fetch(this.url, { headers: { Accept: 'application/json' } }); // eslint-disable-line @typescript-eslint/naming-convention
            if (!response.ok) {
                return false;
            }
            const parsed = info.safeParse(await response.json());
            return parsed.success && parsed.data.isInDebugMode;
        } catch {
            return false;
        }
    }

    public getPipelineStatistics(token: string): Promise<Result<PipelineVersionStatistics, ProblemDetail>> {
        return this.request(
            this.client.GET('/admin/pipeline-statistics', {
                headers: createAuthorizationHeader(token),
            }),
        );
    }

    public getCurrentPipelineVersions(token: string): Promise<Result<CurrentPipelineVersions, ProblemDetail>> {
        return this.request(
            this.client.GET('/admin/current-pipeline-versions', {
                headers: createAuthorizationHeader(token),
            }),
        );
    }

    public getAllSeqSetCitations(token: string): Promise<Result<AdminSeqSetCitation[], ProblemDetail>> {
        return this.request(
            this.client.GET('/admin/get-all-seqset-citations', {
                headers: createAuthorizationHeader(token),
            }),
        );
    }

    public addSeqSetCitation(
        token: string,
        request: AddSeqSetCitationRequest,
    ): Promise<Result<AdminSeqSetCitation, ProblemDetail>> {
        return this.request(
            this.client.POST('/admin/add-seqset-citation', {
                body: request,
                headers: createAuthorizationHeader(token),
            }),
        );
    }

    public deleteSeqSetCitation(token: string, sourceDOI: string): Promise<Result<unknown, ProblemDetail>> {
        return this.request(
            this.client.DELETE('/admin/delete-seqset-citation', {
                params: { query: { sourceDOI } },
                headers: createAuthorizationHeader(token),
            }),
        );
    }

    private request<T>(call: Promise<FetchResult<T>>): Promise<Result<T, ProblemDetail>>;
    private request<S extends z.ZodTypeAny>(
        call: Promise<FetchResult<unknown>>,
        responseSchema: S,
    ): Promise<Result<z.infer<S>, ProblemDetail>>;
    private async request(
        call: Promise<FetchResult<unknown>>,
        responseSchema?: z.ZodTypeAny,
    ): Promise<Result<unknown, ProblemDetail>> {
        try {
            return ok(
                responseSchema === undefined
                    ? await unwrapBackendResponse(call)
                    : await unwrapBackendResponse(call, responseSchema),
            );
        } catch (error) {
            if (isBackendApiError(error)) {
                return err(error.problemDetail);
            }
            throw error;
        }
    }
}
