import axios from 'axios';

import type { DetailsResponse } from '../types/lapis.ts';

export async function fetchDetailsFromLapis(
    lapisUrl: string,
    request: Record<string, unknown>,
): Promise<DetailsResponse> {
    const response = await axios.post<DetailsResponse>(`${lapisUrl}/metadata`, {
        ...request,
        dataFormat: 'json',
    });
    return response.data;
}
