import type { DetailsResponse } from '../types/lapis.ts';
import { createAuthorizedAxiosInstance } from '../utils/createAuthorizedAxiosInstance.ts';

export async function fetchDetailsFromLapis(
    lapisUrl: string,
    request: Record<string, unknown>,
    accessToken: string | undefined,
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
