import { createBackendApiClient, unwrapBackendResponse } from './backend/backendApiClient.ts';

export type GetSubmittedDataRequest = {
    groupId: number;
    accessionsFilter: string[];
};

/**
 * Downloads the submitted data of the given sequence entries as a zip file.
 * Throws a {@link BackendApiError} if the request fails.
 */
export async function getSubmittedData(
    backendUrl: string,
    organism: string,
    accessToken: string,
    request: GetSubmittedDataRequest,
): Promise<Blob> {
    const client = createBackendApiClient(backendUrl, accessToken);
    // openapi-fetch only parses the body as a blob when the request succeeded; an error body is still read as JSON
    return unwrapBackendResponse(
        client.POST('/{organism}/get-submitted-data', {
            params: { path: { organism } },
            body: request,
            parseAs: 'blob',
        }),
    );
}
