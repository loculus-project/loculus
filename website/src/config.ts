import fs from 'fs';
import path from 'path';

import type { z, ZodError } from 'zod';

import { config, type Config } from './types/config.ts';
import { referenceGenomes, type ReferenceGenomes } from './types/referencesGenomes.ts';
import {
    type ClientConfig,
    type RuntimeConfig,
    type ServerConfig,
    type ServiceUrls,
    serviceUrls,
} from './types/runtimeConfig.ts';

let _config: Config | null = null;
let _runtimeConfig: RuntimeConfig | null = null;
let _referenceGenomes: ReferenceGenomes | null = null;

function getConfigDir(): string {
    const configDir = import.meta.env.CONFIG_DIR;
    if (typeof configDir !== 'string' || configDir === '') {
        throw new Error(`CONFIG_DIR environment variable was not set during build time, is '${configDir}'`);
    }
    return configDir;
}

export function getConfig(): Config {
    if (_config === null) {
        _config = readTypedConfigFile('website_config.json', config);
    }
    return _config;
}

export function getRuntimeConfig(): RuntimeConfig {
    if (_runtimeConfig === null) {
        const serviceConfig = readTypedConfigFile('runtime_config.json', serviceUrls);

        const urlsForClient = import.meta.env.DEV
            ? serviceConfig
            : {
                  backendUrl: '/backendProxy',
                  lapisUrl: '/lapisProxy',
              };

        _runtimeConfig = {
            forClient: makeClientConfig(urlsForClient),
            forServer: makeServerConfig(serviceConfig),
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
    if (_referenceGenomes === null) {
        _referenceGenomes = readTypedConfigFile('reference_genomes.json', referenceGenomes);
    }
    return _referenceGenomes;
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
