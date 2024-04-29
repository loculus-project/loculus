import { z } from 'zod';

export const name = z.string().min(1);

const serviceUrls = z.object({
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
    devMode: z.boolean(),
});
export type RuntimeConfig = z.infer<typeof runtimeConfig>;
