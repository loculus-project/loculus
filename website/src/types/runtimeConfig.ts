import { z } from 'zod';

export const name = z.string().min(1);

export const serviceUrls = z.object({
    backendUrl: z.string(),
    lapisUrls: z.record(z.string(), z.string()),
});
export type ServiceUrls = z.infer<typeof serviceUrls>;

export type ClientConfig = z.infer<typeof serviceUrls>;

export const serverConfig = serviceUrls.merge(
    z.object({
        keycloakUrl: z.string(),
    }),
);

export const runtimeConfig = z.object({
    public: serviceUrls,
    serverSide: serverConfig,
    backendKeycloakClientSecret: z.string().min(5),
    insecureCookies: z.boolean(),
});

/**
 * Contains the "environment" configuration for the runtime (URLs, etc.).
 *
 * Think: You could deploy the same "organism config" to different environments (test, prod, etc.).
 * That's why this is separate.
 */
export type RuntimeConfig = z.infer<typeof runtimeConfig>;
