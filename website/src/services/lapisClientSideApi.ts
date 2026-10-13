import type { DetailsResponse } from '../types/lapis.ts';
import { createAuthorizedAxiosInstance } from '../utils/createAuthorizedAxiosInstance.ts';

/**
 * Fetches details for a search directly from LAPIS (browser-side).
 * `accessToken` (the logged-in user's token) is attached when LAPIS authentication is enabled.
 */
export async function fetchDetailsFromLapis(
    lapisUrl: string,
    request: Record<string, unknown>,
    accessToken?: string,
): Promise<DetailsResponse> {
    const response = await createAuthorizedAxiosInstance(accessToken).post<DetailsResponse>(
        `${lapisUrl}/sample/details`,
        {
            ...request,
            dataFormat: 'json',
        },
    );
    return response.data;
}
