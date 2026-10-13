import { z } from 'zod';

export const name = z.string().min(1);

export const serviceUrls = z.object({
    backendUrl: z.string(),
    lapisUrls: z.record(z.string(), z.string()),
});
export type ServiceUrls = z.infer<typeof serviceUrls>;

/**
 * Browser-facing service URLs: the absolute, directly reachable LAPIS URLs.
 * Browser→LAPIS calls authenticate with the logged-in user's token via the Authorization
 * header (attached by `createAuthorizedAxiosInstance`), so no proxy is involved.
 *
 * `lapisAuthEnabled` mirrors the deployment's `lapis.auth.enabled` Helm value: when true,
 * the website routes that serve LAPIS data require a logged-in user (the auth middleware
 * redirects anonymous visitors to Keycloak).
 */
export const publicServiceUrls = serviceUrls.merge(
    z.object({
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
