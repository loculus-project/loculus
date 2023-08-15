import fs from 'fs';
import path from 'path';

import { clientLogger } from './api';
import type { Config, ReferenceGenomes } from './types';
import testConfig from '../tests/config/config.json';
import testReferenceGenomes from '../tests/config/reference-genomes.json';

let _config: Config | null = null;
let _referenceGenomes: ReferenceGenomes | null = null;

export function getConfig(): Config {
    if (_config === null) {
        if (import.meta.env.BACKEND_URL === undefined) {
            throw new Error('BACKEND_URL environment variable is not set');
        }
        if (import.meta.env.USE_TEST_CONFIG === 'true' || import.meta.env.USE_TEST_CONFIG === true) {
            _config = { ...testConfig, backendUrl: import.meta.env.BACKEND_URL } as Config;
        } else {
            if (import.meta.env.CONFIG_DIR === undefined) {
                throw new Error('CONFIG_DIR environment variable is not set');
            }
            const configFilePath = path.join(import.meta.env.CONFIG_DIR, 'config.json');
            _config = {
                ...JSON.parse(fs.readFileSync(configFilePath, 'utf8')),
                backendUrl: import.meta.env.BACKEND_URL,
            } as Config;
        }
    }
    return _config;
}

export function getReferenceGenomes(): ReferenceGenomes {
    if (_referenceGenomes === null) {
        if (import.meta.env.USE_TEST_CONFIG === 'true' || import.meta.env.USE_TEST_CONFIG === true) {
            _referenceGenomes = testReferenceGenomes as ReferenceGenomes;
        } else {
            if (import.meta.env.CONFIG_DIR === undefined) {
                throw new Error('CONFIG_DIR environment variable is not set');
            }
            const configFilePath = path.join(import.meta.env.CONFIG_DIR, 'reference-genomes.json');
            _referenceGenomes = JSON.parse(fs.readFileSync(configFilePath, 'utf8')) as ReferenceGenomes;
        }
    }
    return _referenceGenomes;
}

export type OptionList = { option: string | null; count: number }[];

export async function fetchAutoCompletion(
    field: string,
    filterParams: URLSearchParams,
    config: Config,
): Promise<OptionList> {
    const response = await fetch(`${config.lapisHost}/aggregated?fields=${field}&${filterParams}`);

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
