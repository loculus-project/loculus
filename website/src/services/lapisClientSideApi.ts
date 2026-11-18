import { sendRequest } from './apiRequest.ts';
import {
    aggregatedResponse,
    type AggregatedResponse,
    detailsResponse,
    type DetailsResponse,
    type LapisRequest,
} from '../types/lapis.ts';

/**
 * Plain LAPIS requests for use outside of React hooks (or inside a custom `queryFn`).
 * Prefer `lapisClientHooks` in components where a hook fits.
 *
 * Throws an `AxiosError` on HTTP/network errors and a `ResponseValidationError` if the response doesn't match.
 */

export function fetchLapisDetails(
    lapisUrl: string,
    request: LapisRequest,
    signal?: AbortSignal,
): Promise<DetailsResponse> {
    return sendRequest(lapisUrl, {
        method: 'post',
        path: '/sample/details',
        data: request,
        signal,
        responseSchema: detailsResponse,
    });
}

export function fetchLapisAggregated(
    lapisUrl: string,
    request: LapisRequest,
    signal?: AbortSignal,
): Promise<AggregatedResponse> {
    return sendRequest(lapisUrl, {
        method: 'post',
        path: '/sample/aggregated',
        data: request,
        signal,
        responseSchema: aggregatedResponse,
    });
}
