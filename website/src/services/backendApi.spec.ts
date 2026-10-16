import { isErrorFromAlias } from '@zodios/core';
import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, test } from 'vitest';

import { backendApi } from './backendApi.ts';

// EditPage reads the backend's `detail` only when isErrorFromAlias accepts the response, which
// validates it against `problemDetail`. This is the path that produced the Axios dump in #7103.
function backendError(data: unknown) {
    const config = { headers: new AxiosHeaders(), method: 'post', url: '/west-nile/revise' };
    return new AxiosError('Request failed with status code 422', 'ERR_BAD_REQUEST', config, undefined, {
        status: 422,
        statusText: 'Unprocessable Content',
        headers: new AxiosHeaders(),
        config,
        data,
    });
}

describe('backendApi error schemas', () => {
    test('accepts a revise error in the shape the backend actually sends', () => {
        const error = backendError({
            title: 'Unprocessable Content',
            status: 422,
            detail: 'Accession version LOC_001DSEM.1 is in status APPROVED_FOR_RELEASE, not in AWAITING_APPROVAL',
            instance: '/west-nile/revise',
        });

        expect(isErrorFromAlias(backendApi, 'revise', error)).toBe(true);
    });

    test('accepts a revise error whose instance is null', () => {
        const error = backendError({
            title: 'Unprocessable Content',
            status: 422,
            detail: 'Accession version LOC_001DSEM.1 is in status APPROVED_FOR_RELEASE, not in AWAITING_APPROVAL',
            instance: null,
        });

        expect(isErrorFromAlias(backendApi, 'revise', error)).toBe(true);
    });
});
