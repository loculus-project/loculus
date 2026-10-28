import axios, { type AxiosInstance } from 'axios';

import { createAuthorizationHeader } from './createAuthorizationHeader.ts';

/**
 * Creates an axios instance that sends the given access token (if any) as Bearer token with every request.
 * Without a token, requests are sent unauthenticated, which works unless the instance sets
 * `auth.requireAuthenticationForData`.
 */
export function createAuthorizedAxiosInstance(accessToken: string | undefined): AxiosInstance {
    return axios.create({ headers: createAuthorizationHeader(accessToken) });
}
