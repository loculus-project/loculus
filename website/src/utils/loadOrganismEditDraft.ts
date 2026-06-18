import { getRuntimeConfig } from '../config';
import { AdminConfigError, getAdminConfigClient } from '../services/adminConfigClient';
import { fetchOrganismConfig } from '../services/configClient';
import type { CanonicalOrganismConfig, OrganismDraftResponse } from '../types/loculusConfig';

export interface LoadOrganismEditDraftResult {
    redirectTo: string | null;
    loadError: string | null;
    draft: OrganismDraftResponse | null;
    // Latest released config, returned alongside the draft so edit forms can seed
    // inputs from what's live rather than the post-op draft state.
    publishedConfig: CanonicalOrganismConfig | null;
    accessToken: string | null;
    publicBackendUrl: string;
}

// Shared loader for the `/admin/config/organisms/{key}/edit/...` sub-pages:
// confirms the organism is released (else redirects) and returns the current
// draft, seeded from the latest published config when none exists yet.
export async function loadOrganismEditDraft(session: Session, key: string): Promise<LoadOrganismEditDraftResult> {
    const runtime = getRuntimeConfig();
    const result: LoadOrganismEditDraftResult = {
        redirectTo: null,
        loadError: null,
        draft: null,
        publishedConfig: null,
        accessToken: session.token?.accessToken ?? null,
        publicBackendUrl: runtime.public.backendUrl,
    };
    const client = await getAdminConfigClient(session);

    try {
        const list = await client.listOrganisms();
        const found = list.organisms.find((o) => o.key === key);
        if (found === undefined) {
            result.redirectTo = '/admin/config/organisms';
            return result;
        }
        if (found.status === 'unreleased') {
            result.redirectTo = `/admin/config/organisms/${encodeURIComponent(key)}/draft`;
            return result;
        }
    } catch (e) {
        result.loadError = AdminConfigError.isInstance(e) ? (e.body.message ?? e.body.error) : String(e);
        return result;
    }

    try {
        const [draft, released] = await Promise.all([
            client.getOrganismDraft(key),
            fetchOrganismConfig(runtime.serverSide.backendUrl, key),
        ]);
        result.publishedConfig = released.config;
        if (draft !== null) {
            result.draft = draft;
        } else {
            result.draft = {
                config: released.config,
                baseVersion: released.version,
                revision: 0,
                operations: [],
            };
        }
    } catch (e) {
        result.loadError = AdminConfigError.isInstance(e) ? (e.body.message ?? e.body.error) : String(e);
    }

    return result;
}
