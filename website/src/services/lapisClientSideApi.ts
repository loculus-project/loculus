import { getLapisAxios } from './lapisCache/browserLapisAxios.ts';
import type { DetailsResponse } from '../types/lapis.ts';

export async function fetchDetailsFromLapis(
    lapisUrl: string,
    request: Record<string, unknown>,
): Promise<DetailsResponse> {
    const response = await getLapisAxios(lapisUrl).post<DetailsResponse>(`${lapisUrl}/sample/details`, {
        ...request,
        dataFormat: 'json',
    });
    return response.data;
}
