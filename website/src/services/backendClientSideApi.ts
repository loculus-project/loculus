import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';

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

function extractErrorDetail(errorText: string) {
    try {
        const errorJson = JSON.parse(errorText) as { message?: unknown; detail?: unknown };
        if (typeof errorJson.message === 'string') {
            return errorJson.message;
        }
        if (typeof errorJson.detail === 'string') {
            return errorJson.detail;
        }
    } catch {
        return errorText;
    }

    return errorText;
}

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
                detail: extractErrorDetail(errorText),
            },
        };
    }

    const blob = await response.blob();
    return { ok: true, blob };
}
