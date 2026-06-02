import { defineMiddleware } from 'astro/middleware';

import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';
import { withWebsiteConfig } from '../serverWebsiteConfigStore.ts';
import {
    ConfigFetchError,
    fetchInstanceConfig,
    fetchOrganismConfig,
    fetchOrganismsList,
} from '../services/configClient.ts';
import { toWebsiteConfig } from '../services/configTransform.ts';
import type { WebsiteConfig } from '../types/config.ts';
import type { CanonicalOrganismConfig } from '../types/loculusConfig.ts';

const logger = getInstanceLogger('ConfigMiddleware');

const CACHE_TTL_MS = 5_000;
let cached: { config: WebsiteConfig; expiresAt: number } | undefined;
let inflight: Promise<WebsiteConfig> | undefined;

async function loadWebsiteConfig(backendUrl: string): Promise<WebsiteConfig> {
    const [instance, organismsList] = await Promise.all([
        fetchInstanceConfig(backendUrl),
        fetchOrganismsList(backendUrl),
    ]);
    const organismConfigs = await Promise.all(
        organismsList.organisms.map((summary) => fetchOrganismConfig(backendUrl, summary.key)),
    );
    const organisms: Record<string, CanonicalOrganismConfig> = {};
    for (const r of organismConfigs) {
        organisms[r.key] = r.config;
    }
    return toWebsiteConfig(instance, organisms);
}

export const configMiddleware = defineMiddleware(async (_context, next) => {
    const backendUrl = getRuntimeConfig().serverSide.backendUrl;
    let websiteConfig: WebsiteConfig;
    try {
        const now = Date.now();
        if (cached && cached.expiresAt > now) {
            websiteConfig = cached.config;
        } else {
            inflight ??= loadWebsiteConfig(backendUrl)
                .then((cfg) => {
                    cached = { config: cfg, expiresAt: Date.now() + CACHE_TTL_MS };
                    return cfg;
                })
                .finally(() => {
                    inflight = undefined;
                });
            websiteConfig = await inflight;
        }
    } catch (e) {
        if (e instanceof ConfigFetchError) {
            logger.error(
                `config fetch failed (${e.url ?? '?'}, status=${e.status ?? '?'}): ${e.message}; returning 503`,
            );
        } else {
            logger.error(`config load failed: ${(e as Error).message}; returning 503`);
        }
        return new Response('Backend config unavailable', { status: 503 });
    }
    return withWebsiteConfig(websiteConfig, async () => next());
});
