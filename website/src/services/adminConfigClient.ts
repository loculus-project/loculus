import {
    adminApiError,
    adminOrganismsListResponse,
    auditResponse,
    canonicalInstanceConfig,
    canonicalOrganismConfig,
    draftMutationResponse,
    instanceDraftResponse,
    organismDraftResponse,
    organismListing,
    preprocessingConfigListResponse,
    publishResponse,
    versionsResponse,
    type AdminApiError,
    type AdminOrganismsListResponse,
    type AuditResponse,
    type CanonicalInstanceConfig,
    type CanonicalOrganismConfig,
    type DraftMutationResponse,
    type InstanceDraftResponse,
    type OperationRequest,
    type OrganismDraftResponse,
    type OrganismListing,
    type PreprocessingConfigVersion,
    type PublishResponse,
    type VersionsResponse,
} from '../types/loculusConfig.ts';

export class AdminConfigError extends Error {
    constructor(
        readonly status: number,
        readonly body: AdminApiError,
    ) {
        super(`admin api ${status} ${body.error}${body.message ? `: ${body.message}` : ''}`);
        this.name = 'AdminConfigError';
    }

    static isInstance(e: unknown): e is AdminConfigError {
        return e instanceof AdminConfigError;
    }
}

function authHeaders(accessToken: string): Record<string, string> {
    return {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Authorization: `Bearer ${accessToken}`,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Accept: 'application/json',
    };
}

async function send(
    accessToken: string,
    backendUrl: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    ifMatch?: number,
): Promise<{ status: number; body: unknown }> {
    const url = `${backendUrl.replace(/\/$/, '')}${path}`;
    const headers: Record<string, string> = authHeaders(accessToken);
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }
    if (ifMatch !== undefined) {
        headers['If-Match'] = String(ifMatch);
    }
    const response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 204) {
        return { status: 204, body: null };
    }
    const text = await response.text();
    let parsed: unknown = null;
    if (text.length > 0) {
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = { error: 'invalid_json', message: text.slice(0, 256) } satisfies AdminApiError;
        }
    }
    if (!response.ok) {
        const errBody = adminApiError.safeParse(parsed);
        throw new AdminConfigError(
            response.status,
            errBody.success
                ? errBody.data
                : { error: 'unexpected_error', message: typeof parsed === 'string' ? parsed : undefined },
        );
    }
    return { status: response.status, body: parsed };
}

export class AdminConfigClient {
    constructor(
        private readonly accessToken: string,
        private readonly backendUrl: string,
    ) {}

    private send(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        path: string,
        body?: unknown,
        ifMatch?: number,
    ): Promise<{ status: number; body: unknown }> {
        return send(this.accessToken, this.backendUrl, method, path, body, ifMatch);
    }

    async listOrganisms(): Promise<AdminOrganismsListResponse> {
        const { body } = await this.send('GET', '/api/admin/config/organisms');
        return adminOrganismsListResponse.parse(body);
    }

    async createOrganism(key: string): Promise<OrganismListing> {
        const { body } = await this.send('POST', '/api/admin/config/organisms', { key });
        return organismListing.parse(body);
    }

    async getOrganismDraft(key: string): Promise<OrganismDraftResponse | null> {
        const { status, body } = await this.send('GET', `/api/admin/config/organisms/${encodeURIComponent(key)}/draft`);
        if (status === 204) return null;
        return organismDraftResponse.parse(body);
    }

    async putOrganismDraft(
        key: string,
        config: CanonicalOrganismConfig,
        ifMatch?: number,
    ): Promise<DraftMutationResponse> {
        const { body } = await this.send(
            'PUT',
            `/api/admin/config/organisms/${encodeURIComponent(key)}/draft`,
            { config },
            ifMatch,
        );
        return draftMutationResponse.parse(body);
    }

    async appendOrganismOperation(key: string, op: OperationRequest, ifMatch?: number): Promise<DraftMutationResponse> {
        const { body } = await this.send(
            'POST',
            `/api/admin/config/organisms/${encodeURIComponent(key)}/draft/operations`,
            { operations: [op] },
            ifMatch,
        );
        return draftMutationResponse.parse(body);
    }

    async discardOrganismDraft(key: string): Promise<void> {
        await this.send('DELETE', `/api/admin/config/organisms/${encodeURIComponent(key)}/draft`);
    }

    async publishOrganism(key: string): Promise<PublishResponse> {
        const { body } = await this.send('POST', `/api/admin/config/organisms/${encodeURIComponent(key)}/publish`);
        return publishResponse.parse(body);
    }

    async markOrganismDeployed(key: string): Promise<OrganismListing> {
        const { body } = await this.send(
            'POST',
            `/api/admin/config/organisms/${encodeURIComponent(key)}/mark-deployed`,
        );
        return organismListing.parse(body);
    }

    async listOrganismVersions(key: string): Promise<VersionsResponse> {
        const { body } = await this.send('GET', `/api/admin/config/organisms/${encodeURIComponent(key)}/versions`);
        return versionsResponse.parse(body);
    }

    async getInstanceDraft(): Promise<InstanceDraftResponse | null> {
        const { status, body } = await this.send('GET', '/api/admin/config/instance/draft');
        if (status === 204) return null;
        return instanceDraftResponse.parse(body);
    }

    async putInstanceDraft(config: CanonicalInstanceConfig, ifMatch?: number): Promise<DraftMutationResponse> {
        const { body } = await this.send('PUT', '/api/admin/config/instance/draft', { config }, ifMatch);
        return draftMutationResponse.parse(body);
    }

    async appendInstanceOperation(op: OperationRequest, ifMatch?: number): Promise<DraftMutationResponse> {
        const { body } = await this.send(
            'POST',
            '/api/admin/config/instance/draft/operations',
            { operations: [op] },
            ifMatch,
        );
        return draftMutationResponse.parse(body);
    }

    async discardInstanceDraft(): Promise<void> {
        await this.send('DELETE', '/api/admin/config/instance/draft');
    }

    async publishInstance(): Promise<PublishResponse> {
        const { body } = await this.send('POST', '/api/admin/config/instance/publish');
        return publishResponse.parse(body);
    }

    async listInstanceVersions(): Promise<VersionsResponse> {
        const { body } = await this.send('GET', '/api/admin/config/instance/versions');
        return versionsResponse.parse(body);
    }

    async audit(organismKey?: string): Promise<AuditResponse> {
        const qs = organismKey === undefined ? '' : `?organism=${encodeURIComponent(organismKey)}`;
        const { body } = await this.send('GET', `/api/admin/config/audit${qs}`);
        return auditResponse.parse(body);
    }

    // --- Preprocessing config files ---------------------------------------
    // These are opaque text, served by a dedicated endpoint (not JSON), and
    // unversioned (direct save). They use raw fetch rather than the JSON `send`.

    private url(path: string): string {
        return `${this.backendUrl.replace(/\/$/, '')}${path}`;
    }

    async listPreprocessingConfigs(key: string): Promise<PreprocessingConfigVersion[]> {
        const response = await fetch(this.url(`/api/config/organisms/${encodeURIComponent(key)}/preprocessing`), {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
            throw new AdminConfigError(response.status, { error: 'unexpected_error' });
        }
        return preprocessingConfigListResponse.parse(await response.json()).versions;
    }

    /** Returns the raw config-file text, or null if none is configured (404). */
    async getPreprocessingConfig(key: string, pipelineVersion: number): Promise<string | null> {
        const response = await fetch(
            this.url(`/api/config/organisms/${encodeURIComponent(key)}/preprocessing/${pipelineVersion}`),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            { headers: { Accept: 'text/plain' } },
        );
        if (response.status === 404) return null;
        if (!response.ok) {
            throw new AdminConfigError(response.status, { error: 'unexpected_error' });
        }
        return response.text();
    }

    async setPreprocessingConfig(key: string, pipelineVersion: number, content: string): Promise<void> {
        const response = await fetch(
            this.url(`/api/admin/config/organisms/${encodeURIComponent(key)}/preprocessing/${pipelineVersion}`),
            {
                method: 'PUT',
                headers: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    'Authorization': `Bearer ${this.accessToken}`,
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    'Content-Type': 'text/plain',
                },
                body: content,
            },
        );
        if (!response.ok && response.status !== 204) {
            throw await toAdminError(response);
        }
    }

    async deletePreprocessingConfig(key: string, pipelineVersion: number): Promise<void> {
        const response = await fetch(
            this.url(`/api/admin/config/organisms/${encodeURIComponent(key)}/preprocessing/${pipelineVersion}`),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            { method: 'DELETE', headers: { Authorization: `Bearer ${this.accessToken}` } },
        );
        if (!response.ok && response.status !== 204) {
            throw await toAdminError(response);
        }
    }
}

async function toAdminError(response: Response): Promise<AdminConfigError> {
    const text = await response.text();
    let parsed: unknown = null;
    if (text.length > 0) {
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = { error: 'invalid_json', message: text.slice(0, 256) } satisfies AdminApiError;
        }
    }
    const errBody = adminApiError.safeParse(parsed);
    return new AdminConfigError(response.status, errBody.success ? errBody.data : { error: 'unexpected_error' });
}

// SSR-only. Throws if the session has no access token; the dynamic import keeps
// `config.ts` out of client-bundled callers of this module.
export async function getAdminConfigClient(session: Session): Promise<AdminConfigClient> {
    const token = session.token?.accessToken;
    if (token === undefined) {
        throw new Error('getAdminConfigClient called without an access token on the session');
    }
    const { getRuntimeConfig } = await import('../config.ts');
    return new AdminConfigClient(token, getRuntimeConfig().serverSide.backendUrl);
}

export { canonicalOrganismConfig, canonicalInstanceConfig };
