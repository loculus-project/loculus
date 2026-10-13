import axios, { type AxiosInstance } from 'axios';

/**
 * Creates an axios instance that attaches the given access token (if any) as an
 * `Authorization: Bearer ...` header to every request.
 *
 * Used for calls to services that require a Keycloak-issued JWT when the deployment enables
 * authentication (LAPIS with `lapis.auth.enabled`, the Loculus backend's data endpoints).
 * When no token is given, requests are sent unauthenticated, which is correct for deployments
 * where the service does not require one.
 *
 * Note: callers rely on the deployment's long access token lifetime (10 h, see
 * `keycloak-config-map.yaml`). If that lifetime is ever reduced, callers that hold a token
 * across a session (e.g. the search page) must add client-side 401 handling first.
 */
export function createAuthorizedAxiosInstance(accessToken?: string): AxiosInstance {
    const instance = axios.create();
    if (accessToken !== undefined) {
        instance.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
    }
    return instance;
}
