import fs from 'fs';
import path from 'path';

import type { z, ZodError } from 'zod';

import { type Schema, type WebsiteConfig, websiteConfig } from './types/config.ts';
import { type ReferenceGenomes } from './types/referencesGenomes.ts';
import {
    type ClientConfig,
    type RuntimeConfig,
    type ServerConfig,
    type ServiceUrls,
    serviceUrls,
} from './types/runtimeConfig.ts';

let _config: WebsiteConfig | null = null;
let _runtimeConfig: RuntimeConfig | null = null;

function getConfigDir(): string {
    const configDir = import.meta.env.CONFIG_DIR;
    if (typeof configDir !== 'string' || configDir === '') {
        throw new Error(`CONFIG_DIR environment variable was not set during build time, is '${configDir}'`);
    }
    return configDir;
}

export function getConfig(): Schema {
    if (_config === null) {
        _config = readTypedConfigFile('website_config.json', websiteConfig);
    }
    return Object.values(_config.instances)[0].schema;
}

export function getRuntimeConfig(): RuntimeConfig {
    if (_runtimeConfig === null) {
        const runtimeConfig = readTypedConfigFile('runtime_config.json', serviceUrls);

        const urlsForClient = import.meta.env.DEV
            ? runtimeConfig
            : {
                  backendUrl: '/backendProxy',
                  lapisUrl: '/lapisProxy',
                  keycloakUrl: '/keycloakProxy',
              };

        _runtimeConfig = {
            forClient: makeClientConfig(urlsForClient),
            forServer: makeServerConfig(runtimeConfig),
        };
    }
    return _runtimeConfig;
}

function makeServerConfig(serviceConfig: ServiceUrls): ServerConfig {
    return {
        discriminator: 'server',
        ...serviceConfig,
    };
}

function makeClientConfig(serviceConfig: ServiceUrls): ClientConfig {
    return {
        discriminator: 'client',
        ...serviceConfig,
    };
}

export function getReferenceGenomes(): ReferenceGenomes {
    if (_config === null) {
        _config = readTypedConfigFile('website_config.json', websiteConfig);
    }
    return Object.values(_config.instances)[0].referenceGenomes;
}

function readTypedConfigFile<T>(fileName: string, schema: z.ZodType<T>) {
    const configFilePath = path.join(getConfigDir(), fileName);
    const json = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    try {
        return schema.parse(json);
    } catch (e) {
        const zodError = e as ZodError;
        throw new Error(`Type error reading ${configFilePath}: ${zodError.message}`);
    }
}
