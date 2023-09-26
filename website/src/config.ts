import fs from 'fs';
import path from 'path';

import { clientLogger } from './api';
import type { Config, ReferenceGenomes, RuntimeConfig } from './types';

const configDir = import.meta.env.CONFIG_DIR;

let _config: Config | null = null;
let _runtimeConfig: RuntimeConfig | null = null;
let _referenceGenomes: ReferenceGenomes | null = null;

function getConfigDir(): string {
    if (typeof configDir !== 'string' || configDir === '') {
        throw new Error(`CONFIG_DIR environment variable was not set during build time, is ${configDir}`);
    }
    return configDir;
}

export function getConfig(): Config {
    if (_config === null) {
        const configFilePath = path.join(getConfigDir(), 'config.json');
        _config = JSON.parse(fs.readFileSync(configFilePath, 'utf8')) as Config;
    }
    return _config;
}

export function getRuntimeConfig(): RuntimeConfig {
    if (_runtimeConfig === null) {
        const configFilePath = path.join(getConfigDir(), 'runtime-config.json');
        _runtimeConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf8')) as RuntimeConfig;
    }
    return _runtimeConfig;
}

export function getReferenceGenomes(): ReferenceGenomes {
    if (_referenceGenomes === null) {
        const configFilePath = path.join(getConfigDir(), 'reference-genomes.json');
        _referenceGenomes = JSON.parse(fs.readFileSync(configFilePath, 'utf8')) as ReferenceGenomes;
    }
    return _referenceGenomes;
}

export type OptionList = { option: string | null; count: number }[];

export async function fetchAutoCompletion(
    field: string,
    filterParams: URLSearchParams,
    runtimeConfig: RuntimeConfig,
): Promise<OptionList> {
    const response = await fetch(`${runtimeConfig.lapisUrl}/aggregated?fields=${field}&${filterParams}`);

    if (!response.ok) {
        await clientLogger.error(
            `Failed to fetch auto-completion data for field ${field} with status ${response.status}`,
        );
        return [];
    }

    // TODO: introduce validation of the response; will make working with the data easier
    const autoCompleteData = (await response.json()).data as { [key: string]: string | number | null }[];

    return (
        autoCompleteData
            .map((entry) => ({ option: entry[field] as string | null, count: entry.count as number }))
            .filter((entry) => entry.option !== null)
            // As option:null values are already filtered out, we can safely cast option to string
            // eslint-disable-next-line
            .sort((a, b) => (a.option!.toLowerCase() < b.option!.toLowerCase() ? -1 : 1))
    );
}
