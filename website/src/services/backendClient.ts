import axios, { AxiosError, type Method } from 'axios';
import { err, ok, Result } from 'neverthrow';
import { z, ZodSchema } from 'zod';

import {
    dataUseTermsHistoryEntry,
    getSequencesResponse,
    info,
    requestUploadResponse,
    sequenceEntryToEdit,
    pipelineVersionStatistics,
    type ProblemDetail,
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
     * Request presigned URLs to upload files to.
     * @param token The bearer token.
     * @param groupId The group ID of the group that will own the uploaded files.
     * @param numberFiles How many file IDs and URLs to generate.
     * @returns A list of file IDs and presigned URLs to upload the files to.
     */
    public requestUpload(token: string, groupId: number, numberFiles: number) {
        return this.request(
            '/files/request-upload',
            'POST',
            requestUploadResponse,
            createAuthorizationHeader(token),
            undefined,
            {
                groupId,
                numberFiles,
            },
        );
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
