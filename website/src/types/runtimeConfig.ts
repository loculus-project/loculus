export type RuntimeConfig = {
    forClient: ClientConfig;
    forServer: ServerConfig;
};

export type ClientConfig = { discriminator: 'client' } & ServiceUrls;
export type ServerConfig = { discriminator: 'server' } & ServiceUrls;

export type ServiceUrls = {
    backendUrl: string;
    lapisUrl: string;
};
