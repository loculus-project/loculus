import { z } from 'zod';

export const name = z.string().min(1);

export const serviceUrls = z.object({
    backendUrl: z.string(),
    lapisUrls: z.record(z.string(), z.string()),
});
export type ServiceUrls = z.infer<typeof serviceUrls>;

/**
 * Browser-facing service URLs. `lapisUrls` point at the same-origin website proxy
 * (`/api/lapis/<organism>`), which attaches the logged-in user's access token server-side;
 * `externalLapisUrls` hold the absolute, directly reachable LAPIS URLs (used for e.g. the
 * API documentation page and external consumers).
 *
 * `lapisAuthEnabled` mirrors the deployment's `lapis.auth.enabled` Helm value: when true,
 * all website routes serving LAPIS data require a logged-in user (the auth middleware
 * redirects anonymous visitors to Keycloak, and the `/api/lapis` proxy answers 401).
 *
 * WARNING: these URLs may be relative, so they are usable from browser-side code only —
 * fetching a relative URL from Node (SSR) throws. Server-side code must use
 * `runtimeConfig.serverSide.lapisUrls` (absolute) together with the `LapisClient` (see
 * `services/lapisClient.ts`); `externalLapisUrls` are absolute and also safe server-side.
 */
export const publicServiceUrls = serviceUrls.merge(
    z.object({
        externalLapisUrls: z.record(z.string(), z.string()),
        lapisAuthEnabled: z.boolean().optional(),
    }),
);

export type ClientConfig = z.infer<typeof publicServiceUrls>;

export const serverConfig = serviceUrls.merge(
    z.object({
        keycloakUrl: z.string(),
    }),
);

export const runtimeConfig = z.object({
    public: publicServiceUrls,
    serverSide: serverConfig,
    backendKeycloakClientSecret: z.string().min(5),
    oidcTransactionCookieSecret: z.string().min(32),
    insecureCookies: z.boolean(),
});

/**
 * Runtime environment configuration (URLs, etc.).
 *
 * Allows the same organism config to be deployed across different environments
 * like test or production.
 */
export type RuntimeConfig = z.infer<typeof runtimeConfig>;
