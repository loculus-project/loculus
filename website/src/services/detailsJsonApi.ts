import { apiPath, sendRequest } from './apiRequest.ts';
import { detailsJsonSchema, type DetailsJson } from '../types/detailsJson.ts';

/**
 * Fetches the website's own `/seq/{accessionVersion}/details.json` endpoint from the browser.
 *
 * Throws an `AxiosError` on HTTP/network errors and a `ResponseValidationError` if the response doesn't match.
 */
export function fetchDetailsJson(accessionVersion: string, signal?: AbortSignal): Promise<DetailsJson> {
    return sendRequest('', {
        method: 'get',
        path: apiPath`/seq/${accessionVersion}/details.json`,
        signal,
        responseSchema: detailsJsonSchema,
    });
}
