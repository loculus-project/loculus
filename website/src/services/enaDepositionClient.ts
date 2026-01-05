import { Zodios } from '@zodios/core';
import { err, ok, type Result } from 'neverthrow';
import type { AxiosError } from 'axios';

import { enaDepositionApi } from './enaDepositionApi.ts';
import type { SubmitItem, PaginatedSubmissions, PaginatedErrors, PreviewResponse, SubmitResponse } from '../types/enaDeposition.ts';
import type { ProblemDetail } from '../types/backend.ts';

/**
 * Browser-safe ENA deposition client.
 * Does not use winston logger to avoid `process is not defined` errors in the browser.
 */
export class EnaDepositionClient {
    private readonly zodios;

    private constructor(enaDepositionUrl: string) {
        this.zodios = new Zodios(enaDepositionUrl, enaDepositionApi);
    }

    public static create(enaDepositionUrl: string) {
        return new EnaDepositionClient(enaDepositionUrl);
    }

    private createError(e: unknown): ProblemDetail {
        const error = e as AxiosError;
        return {
            type: 'about:blank',
            title: error.message ?? 'Unknown error',
            status: error.response?.status ?? 0,
            detail: 'Error from ENA deposition service',
            instance: 'ena-deposition',
        };
    }

    public async getSubmissions(params?: {
        status?: string;
        organism?: string;
        group_id?: number;
        page?: number;
        size?: number;
    }): Promise<Result<PaginatedSubmissions, ProblemDetail>> {
        try {
            const response = await this.zodios.getSubmissions({ queries: params ?? {} });
            return ok(response);
        } catch (e) {
            return err(this.createError(e));
        }
    }

    public async getErrors(params?: {
        table?: string;
        organism?: string;
        group_id?: number;
        page?: number;
        size?: number;
    }): Promise<Result<PaginatedErrors, ProblemDetail>> {
        try {
            const response = await this.zodios.getErrors({ queries: params ?? {} });
            return ok(response);
        } catch (e) {
            return err(this.createError(e));
        }
    }

    public async generatePreview(accessions: string[]): Promise<Result<PreviewResponse, ProblemDetail>> {
        try {
            const response = await this.zodios.generatePreview({ accessions }, {});
            return ok(response);
        } catch (e) {
            return err(this.createError(e));
        }
    }

    public async submitToEna(submissions: SubmitItem[]): Promise<Result<SubmitResponse, ProblemDetail>> {
        try {
            const response = await this.zodios.submitToEna({ submissions }, {});
            return ok(response);
        } catch (e) {
            return err(this.createError(e));
        }
    }

    public async retrySubmission(
        accession: string,
        version: number,
        editedMetadata?: Record<string, unknown>,
    ): Promise<Result<{ success: boolean; message: string }, ProblemDetail>> {
        try {
            const response = await this.zodios.retrySubmission(
                editedMetadata ? { edited_metadata: editedMetadata } : {},
                { params: { accession, version: version.toString() } },
            );
            return ok(response);
        } catch (e) {
            return err(this.createError(e));
        }
    }
}
