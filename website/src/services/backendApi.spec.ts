import { isErrorFromAlias } from '@zodios/core';
import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, test } from 'vitest';

import { backendApi } from './backendApi.ts';
import { problemDetail } from '../types/backend.ts';

/**
 * The exact shape the backend serialises for an error, as observed live against
 * backend-main.loculus.org. Spring's Jackson mixin omits `type` (it never leaves its
 * `about:blank` default) — see ExceptionHandler.responseEntity in the backend. RFC 9457
 * section 3.1.1 makes that omission correct: an absent `type` means `about:blank`.
 *
 * Regression test for #7103: the website used to require `type`, so no backend error ever
 * validated and users were shown a raw AxiosError dump instead of the message.
 */
const backendErrorBody = {
    title: 'Unprocessable Entity',
    status: 422,
    detail: 'Accession version LOC_001DSEM.1 is not in state APPROVED_FOR_RELEASE',
    instance: '/west-nile/revise',
};

const axiosErrorForUrl = (url: string, status = 422) => {
    const config = { url, method: 'post', headers: new AxiosHeaders() };
    return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, {}, {
        data: backendErrorBody,
        status,
        statusText: '',
        headers: {},
        config,
    } as never);
};

describe('problemDetail', () => {
    test('parses a backend error response that omits type, defaulting it per RFC 9457', () => {
        const result = problemDetail.safeParse(backendErrorBody);

        expect(result.success).toBe(true);
        expect(result.data?.type).toBe('about:blank');
        expect(result.data?.detail).toBe(backendErrorBody.detail);
    });

    test('keeps an explicit type', () => {
        const result = problemDetail.safeParse({ ...backendErrorBody, type: 'https://example.org/errors/foo' });

        expect(result.data?.type).toBe('https://example.org/errors/foo');
    });
});

describe('backendApi error declarations', () => {
    test('recognises a backend error from revise', () => {
        expect(isErrorFromAlias(backendApi, 'revise', axiosErrorForUrl('/west-nile/revise'))).toBe(true);
    });

    test('recognises a backend error from submitReviewedSequence', () => {
        expect(
            isErrorFromAlias(backendApi, 'submitReviewedSequence', axiosErrorForUrl('/west-nile/submit-edited-data')),
        ).toBe(true);
    });
});
