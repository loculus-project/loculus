import { z } from 'zod';

export type RuntimeConfig = {
    forClient: ClientConfig;
    forServer: ServerConfig;
};

export const serviceUrls = z.object({
    backendUrl: z.string(),
    lapisUrls: z.record(z.string(), z.string()),
    keycloakUrl: z.string(),
});
export type ServiceUrls = z.infer<typeof serviceUrls>;

export type ClientConfig = { discriminator: 'client' } & ServiceUrls;
export type ServerConfig = { discriminator: 'server' } & ServiceUrls;
