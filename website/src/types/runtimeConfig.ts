import { z } from 'zod';

export const name = z.string().min(1);

export const serviceUrls = z.object({
    backendUrl: z.string(),
    lapisUrls: z.record(z.string(), z.string()),
});
export type ServiceUrls = z.infer<typeof serviceUrls>;

export const publicRuntimeConfig = serviceUrls.merge(
    z.object({
        // Mirrors the Helm value `auth.requireAuthenticationForData`: LAPIS and the backend's data endpoints
        // then only answer requests that carry a valid access token.
        requireAuthenticationForData: z.boolean().optional(),
    }),
);

export type ClientConfig = z.infer<typeof publicRuntimeConfig>;

export const serverConfig = serviceUrls.merge(
    z.object({
        keycloakUrl: z.string(),
    }),
);

export const runtimeConfig = z.object({
    public: publicRuntimeConfig,
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
