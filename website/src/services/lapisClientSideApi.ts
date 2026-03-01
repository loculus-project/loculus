import axios from 'axios';

import type { DetailsResponse } from '../types/lapis.ts';

/**
 * Client-side LAPIS API functions.
 * Use these for imperative LAPIS calls in React components (e.g., button click handlers).
 * For reactive data fetching, use the hooks from serviceHooks.ts instead.
 */
export async function fetchDetailsFromLapis(
    lapisUrl: string,
    request: Record<string, unknown>,
): Promise<DetailsResponse> {
    const response = await axios.post<DetailsResponse>(`${lapisUrl}/sample/details`, {
        ...request,
        dataFormat: 'json',
    });
    return response.data;
}
