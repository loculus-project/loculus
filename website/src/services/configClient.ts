// Public-API config client. Pass the absolute backend URL on every call so this
// module can ship in the client bundle (avoiding the Node-only imports in
// `config.ts`).
import {
    canonicalInstanceResponse,
    canonicalOrganismResponse,
    canonicalOrganismsListResponse,
    type CanonicalInstanceResponse,
    type CanonicalOrganismResponse,
    type CanonicalOrganismsListResponse,
} from '../types/loculusConfig.ts';

export class ConfigFetchError extends Error {
    constructor(
        message: string,
        readonly status?: number,
        readonly url?: string,
    ) {
        super(message);
        this.name = 'ConfigFetchError';
    }
}

async function fetchJson<T>(backendUrl: string, path: string, parse: (raw: unknown) => T): Promise<T> {
    const url = `${backendUrl.replace(/\/$/, '')}${path}`;
    let response: Response;
    try {
        response = await fetch(url, {
            method: 'GET',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            headers: { Accept: 'application/json' },
        });
    } catch (e) {
        throw new ConfigFetchError(`network error fetching ${url}: ${(e as Error).message}`, undefined, url);
    }
    if (!response.ok) {
        throw new ConfigFetchError(`status ${response.status} fetching ${url}`, response.status, url);
    }
    const body = (await response.json()) as unknown;
    try {
        return parse(body);
    } catch (e) {
        throw new ConfigFetchError(`schema error parsing ${url}: ${(e as Error).message}`, response.status, url);
    }
}

export async function fetchInstanceConfig(backendUrl: string): Promise<CanonicalInstanceResponse> {
    return fetchJson(backendUrl, '/api/config/instance', (raw) => canonicalInstanceResponse.parse(raw));
}

export async function fetchOrganismsList(backendUrl: string): Promise<CanonicalOrganismsListResponse> {
    return fetchJson(backendUrl, '/api/config/organisms', (raw) => canonicalOrganismsListResponse.parse(raw));
}

export async function fetchOrganismConfig(backendUrl: string, key: string): Promise<CanonicalOrganismResponse> {
    return fetchJson(backendUrl, `/api/config/organisms/${encodeURIComponent(key)}`, (raw) =>
        canonicalOrganismResponse.parse(raw),
    );
}
