import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';

export type GetSubmittedDataRequest = {
    groupId: number;
    accessionsFilter: string[];
};

export type GetSubmittedDataError = {
    status: number;
    statusText: string;
    detail: string;
};

export type GetSubmittedDataResult = { ok: true; blob: Blob } | { ok: false; error: GetSubmittedDataError };

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

export async function getSubmittedData(
    backendUrl: string,
    organism: string,
    accessToken: string,
    request: GetSubmittedDataRequest,
): Promise<GetSubmittedDataResult> {
    const url = `${backendUrl}/${organism}/get-submitted-data`;

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
