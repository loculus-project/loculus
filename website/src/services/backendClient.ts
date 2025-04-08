import axios, { AxiosError, type Method } from 'axios';
import { err, ok, Result } from 'neverthrow';
import { z, ZodSchema } from 'zod';

import { getInstanceLogger, type InstanceLogger } from '../logger.ts';
import {
    dataUseTermsHistoryEntry,
    getSequencesResponse,
    info,
    sequenceEntryToEdit,
    unprocessedData,
    type ProblemDetail,
} from '../types/backend.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';

const myLogger = getInstanceLogger('BackendClient');

type GetSequencesParameters = {
    groupIdsFilter?: string | undefined;
    statusesFilter?: string | undefined;
    processingResultFilter?: string | undefined;
    page?: number | undefined;
    size?: number | undefined;
};

export class BackendClient {
    constructor(
        private readonly url: string,
        private readonly logger: InstanceLogger = myLogger,
    ) {}

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

    public extractUnprocessedData(
        token: string,
        organism: string,
        numberOfSequenceEntries: number,
        pipelineVersion: number,
    ) {
        return this.request(
            `/${organism}/extract-unprocessed-data`,
            'POST',
            z.union([z.string(), unprocessedData]),
            createAuthorizationHeader(token),
            undefined,
            {
                numberOfSequenceEntries,
                pipelineVersion,
            },
        );
    }

    public submitProcessedData(token: string, organism: string, pipelineVersion: number, body: string) {
        return this.request(
            `/${organism}/submit-processed-data`,
            'POST',
            z.never(),
            {
                ...createAuthorizationHeader(token),
                /* eslint-disable @typescript-eslint/naming-convention -- header names are not camel case */
                'Content-Type': 'application/x-ndjson',
                /* eslint-enable @typescript-eslint/naming-convention */
            },
            body,
            {
                pipelineVersion,
            },
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

    public async isInDebugMode() {
        const infoResponse = await this.request('/', 'GET', info, undefined, undefined, undefined);
        return infoResponse.match(
            (info) => info.isInDebugMode,
            () => false,
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
                instance: '/sample/details',
            });
        } catch (e) {
            const axiosError = e as AxiosError;

            // return err(this.createProblemDetail(axiosError, endpoint));

            return err({
                type: 'about:blank',
                title: 'bad response',
                status: 0,
                detail: `Failed to parse backend response: ${axiosError.cause?.message}`,
                instance: '/sample/details',
            });
        }
    }
}
