import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';

/**
 * Client-side Backend API functions.
 * Use these for imperative backend API calls in React components that need
 * special handling (e.g., blob responses) not supported by the Zodios hooks.
 */

export type GetOriginalDataRequest = {
    groupId: number;
    accessionsFilter: string[];
};

export type GetOriginalDataError = {
    status: number;
    statusText: string;
    detail: string;
};

export type GetOriginalDataResult = { ok: true; blob: Blob } | { ok: false; error: GetOriginalDataError };

export async function getOriginalData(
    backendUrl: string,
    organism: string,
    accessToken: string,
    request: GetOriginalDataRequest,
): Promise<GetOriginalDataResult> {
    const url = `${backendUrl}/${organism}/get-original-data`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            ...createAuthorizationHeader(accessToken),
            'Content-Type': 'application/json', // eslint-disable-line @typescript-eslint/naming-convention
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        const errorText = await response.text();
        return {
            ok: false,
            error: {
                status: response.status,
                statusText: response.statusText,
                detail: errorText,
            },
        };
    }

    const blob = await response.blob();
    return { ok: true, blob };
}
