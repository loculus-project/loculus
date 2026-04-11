import axios, { AxiosError, type Method } from 'axios';
import { err, ok, Result } from 'neverthrow';
import { z, ZodSchema } from 'zod';

import {
    dataUseTermsHistoryEntry,
    getSequencesResponse,
    info,
    requestMultipartUploadResponse,
    sequenceEntryToEdit,
    pipelineVersionStatistics,
    currentPipelineVersions,
    accessionVersionWithOrganism,
    type AccessionVersionWithOrganism,
    type ProblemDetail,
    type CompleteMultipartUploadRequest,
} from '../types/backend.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';

type GetSequencesParameters = {
    groupIdsFilter?: string | undefined;
    statusesFilter?: string | undefined;
    processingResultFilter?: string | undefined;
    page?: number | undefined;
    size?: number | undefined;
};
export class BackendClient {
    constructor(private readonly url: string) {}

    public getDataToEdit(organism: string, token: string, accession: string, version: string | number) {
        return this.request(
            `/${organism}/get-data-to-edit/${accession}/${version}`,
            'GET',
            sequenceEntryToEdit,
            createAuthorizationHeader(token),
            undefined,
            undefined,
        );
    }

    public getDataUseTermsHistory(accession: string) {
        return this.request(
            `/data-use-terms/${accession}`,
            'GET',
            z.array(dataUseTermsHistoryEntry),
            undefined,
            undefined,
            undefined,
        );
    }

    public getSequences(token: string, organism: string, params: GetSequencesParameters) {
        return this.request(
            `/${organism}/get-sequences`,
            'GET',
            getSequencesResponse,
            createAuthorizationHeader(token),
            undefined,
            params,
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
    public requestMultipartUpload(token: string, groupId: number, numberFiles: number, numberParts: number) {
        return this.request(
            '/files/request-multipart-upload',
            'POST',
            requestMultipartUploadResponse,
            createAuthorizationHeader(token),
            undefined,
            {
                groupId,
                numberFiles,
                numberParts,
            },
        );
    }

    /**
     * Complete multipart uploads by providing ETags for all parts.
     * @param token The bearer token.
     * @param fileIdsAndEtags List of file IDs with their corresponding ETags.
     */
    public completeMultipartUpload(token: string, fileIdsAndEtags: CompleteMultipartUploadRequest) {
        return this.request(
            '/files/complete-multipart-upload',
            'POST',
            z.unknown(),
            createAuthorizationHeader(token),
            fileIdsAndEtags,
            undefined,
        );
    }

    public async getDetails(params: {
        accessions?: string[];
        accessionVersions?: string[];
    }): Promise<Result<AccessionVersionWithOrganism[], ProblemDetail>> {
        const searchParams = new URLSearchParams();

        for (const acc of params.accessions ?? []) {
            searchParams.append('accessions', acc);
        }

        for (const av of params.accessionVersions ?? []) {
            searchParams.append('accessionVersions', av);
        }

        try {
            const response: { data: string } = await axios.get(`${this.url}/get-details`, {
                params: searchParams,
                responseType: 'text',
                headers: {
                    accept: 'application/x-ndjson',
                },
            });

            const lines = response.data
                .split('\n')
                .map((line: string) => line.trim())
                .filter((line: string) => line.length > 0);

            const results: AccessionVersionWithOrganism[] = [];

            for (const line of lines) {
                const json = JSON.parse(line);
                const parsed = accessionVersionWithOrganism.safeParse(json);

                if (parsed.success) {
                    results.push(parsed.data);
                }
            }

            return ok(results);
        } catch {
            return err({
                type: 'about:blank',
                title: 'bad response',
                status: 0,
                detail: `Failed to get sequence entry versions with params: ${JSON.stringify(params)}`,
            });
        }
    }

    public async isInDebugMode() {
        const infoResponse = await this.request('/', 'GET', info, undefined, undefined, undefined);
        return infoResponse.match(
            (info) => info.isInDebugMode,
            () => false,
        );
    }

    public getPipelineStatistics(token: string) {
        return this.request(
            '/admin/pipeline-statistics',
            'GET',
            pipelineVersionStatistics,
            createAuthorizationHeader(token),
            undefined,
            undefined,
        );
    }

    public getCurrentPipelineVersions(token: string) {
        return this.request(
            '/admin/current-pipeline-versions',
            'GET',
            currentPipelineVersions,
            createAuthorizationHeader(token),
            undefined,
            undefined,
        );
    }

    private async request<T>(
        endpoint: string,
        method: Method,
        responseSchema: ZodSchema<T>,
        headers: Record<string, string> | undefined,
        request: unknown,
        params: unknown,
    ): Promise<Result<T, ProblemDetail>> {
        try {
            const response = await axios.request({
                url: `${this.url}${endpoint}`,
                method,
                headers,
                params,
                data: request,
            });

            const responseDataResult = responseSchema.safeParse(response.data);
            if (responseDataResult.success) {
                return ok(responseDataResult.data);
            }
            return err({
                type: 'about:blank',
                title: 'bad response',
                status: 0,
                detail: `Failed to parse backend response: ${responseDataResult.error.toString()}`,
            });
        } catch (e) {
            const axiosError = e as AxiosError;

            return err({
                type: 'about:blank',
                title: 'bad response',
                status: 0,
                detail: `Failed to make request: ${axiosError.message}`,
            });
        }
    }
}
