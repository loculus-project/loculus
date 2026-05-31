// Minimal admin-API client used by the loader CLI. Kept separate from the
// website's `adminConfigClient.ts` to avoid coupling the loader to website
// source paths; the two share Zod schemas via `@loculus/config-tools`.
import {
    adminApiError,
    adminOrganismsListResponse,
    draftMutationResponse,
    instanceDraftResponse,
    organismDraftResponse,
    organismListing,
    publishResponse,
    type AdminApiError,
    type AdminOrganismsListResponse,
    type DraftMutationResponse,
    type InstanceDraftResponse,
    type OrganismDraftResponse,
    type OrganismListing,
    type PublishResponse,
} from '../schema/adminApi.ts';
import type { CanonicalInstanceConfig, CanonicalOrganismConfig } from '../schema/canonicalConfig.ts';

export class AdminApiHttpError extends Error {
    constructor(
        readonly status: number,
        readonly body: AdminApiError,
    ) {
        super(`admin api ${status} ${body.error}${body.message !== undefined ? `: ${body.message}` : ''}`);
        this.name = 'AdminApiHttpError';
    }
}

function parseResponseBody(text: string): unknown {
    if (text.length === 0) return null;
    try {
        return JSON.parse(text);
    } catch {
        return { error: 'invalid_json', message: text.slice(0, 256) } satisfies AdminApiError;
    }
}

function httpError(status: number, parsed: unknown): AdminApiHttpError {
    const errBody = adminApiError.safeParse(parsed);
    return new AdminApiHttpError(
        status,
        errBody.success
            ? errBody.data
            : { error: 'unexpected_error', message: typeof parsed === 'string' ? parsed : undefined },
    );
}

export interface AdminClientOptions {
    backendUrl: string;
    accessToken: string;
}

export class LoaderAdminClient {
    private readonly backendUrl: string;
    private readonly accessToken: string;

    constructor(options: AdminClientOptions) {
        this.backendUrl = options.backendUrl.replace(/\/$/, '');
        this.accessToken = options.accessToken;
    }

    private async send(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        path: string,
        body?: unknown,
        ifMatch?: number,
    ): Promise<{ status: number; body: unknown }> {
        const url = `${this.backendUrl}${path}`;
        const headers: Record<string, string> = {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            Authorization: `Bearer ${this.accessToken}`,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            Accept: 'application/json',
        };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (ifMatch !== undefined) headers['If-Match'] = String(ifMatch);

        const response = await fetch(url, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (response.status === 204) {
            return { status: 204, body: null };
        }
        const parsed = parseResponseBody(await response.text());
        if (!response.ok) throw httpError(response.status, parsed);
        return { status: response.status, body: parsed };
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
        const { status, body } = await this.send(
            'GET',
            `/api/admin/config/organisms/${encodeURIComponent(key)}/draft`,
        );
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

    async getInstanceDraft(): Promise<InstanceDraftResponse | null> {
        const { status, body } = await this.send('GET', '/api/admin/config/instance/draft');
        if (status === 204) return null;
        return instanceDraftResponse.parse(body);
    }

    async putInstanceDraft(config: CanonicalInstanceConfig, ifMatch?: number): Promise<DraftMutationResponse> {
        const { body } = await this.send('PUT', '/api/admin/config/instance/draft', { config }, ifMatch);
        return draftMutationResponse.parse(body);
    }

    async publishInstance(): Promise<PublishResponse> {
        const { body } = await this.send('POST', '/api/admin/config/instance/publish');
        return publishResponse.parse(body);
    }

    // The body is raw text, so this bypasses the JSON `send` helper.
    async setPreprocessingConfig(key: string, pipelineVersion: number, content: string): Promise<void> {
        const url =
            `${this.backendUrl}/api/admin/config/organisms/${encodeURIComponent(key)}` +
            `/preprocessing/${pipelineVersion}`;
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                Authorization: `Bearer ${this.accessToken}`,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'text/plain',
            },
            body: content,
        });
        if (!response.ok && response.status !== 204) {
            throw httpError(response.status, parseResponseBody(await response.text()));
        }
    }
}
