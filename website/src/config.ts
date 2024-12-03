import fs from 'fs';
import path from 'path';

import type { z, ZodError } from 'zod';

import { type InstanceConfig, type Schema, type WebsiteConfig, websiteConfig } from './types/config.ts';
import { type ReferenceGenomes } from './types/referencesGenomes.ts';
import { runtimeConfig, type RuntimeConfig, type ServiceUrls } from './types/runtimeConfig.ts';

let _config: WebsiteConfig | null = null;
let _runtimeConfig: RuntimeConfig | null = null;

function getConfigDir(): string {
    const configDir = import.meta.env.CONFIG_DIR;
    if (typeof configDir !== 'string' || configDir === '') {
        throw new Error(`CONFIG_DIR environment variable was not set during build time, is '${configDir}'`);
    }
    return configDir;
}

export function getWebsiteConfig(): WebsiteConfig {
    if (_config === null) {
        _config = readTypedConfigFile('website_config.json', websiteConfig);
    }
    return _config;
}

export function safeGetWebsiteConfig(): WebsiteConfig | null {
    try {
        return getWebsiteConfig();
    } catch (e) {
        return null;
    }
}

export function getMetadataDisplayNames(organism: string): Map<string, string> {
    return new Map(
        getWebsiteConfig().organisms[organism].schema.metadata.map(({ name, displayName }) => [
            name,
            displayName ?? name,
        ]),
    );
}

export type Organism = {
    key: string;
    displayName: string;
};

export function getConfiguredOrganisms() {
    return Object.entries(getWebsiteConfig().organisms).map(([key, instance]) => ({
        key,
        displayName: instance.schema.organismName,
        image: instance.schema.image,
        description: instance.schema.description,
    }));
}

function getConfig(organism: string): InstanceConfig {
    const websiteConfig = getWebsiteConfig();
    if (!(organism in websiteConfig.organisms)) {
        throw new Error(`No configuration for organism ${organism}`);
    }
    return websiteConfig.organisms[organism];
}

export function getSchema(organism: string): Schema {
    return getConfig(organism).schema;
}

export function getRuntimeConfig(): RuntimeConfig {
    if (_runtimeConfig === null) {
        _runtimeConfig = readTypedConfigFile('runtime_config.json', runtimeConfig);
    }
    return _runtimeConfig;
}

export function getLapisUrl(serviceConfig: ServiceUrls, organism: string): string {
    if (!(organism in serviceConfig.lapisUrls)) {
        throw new Error(`No lapis url configured for organism ${organism}`);
    }
    return serviceConfig.lapisUrls[organism];
}

export function getReferenceGenomes(organism: string): ReferenceGenomes {
    return getConfig(organism).referenceGenomes;
}

export function seqSetsAreEnabled() {
    return getWebsiteConfig().enableSeqSets;
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
