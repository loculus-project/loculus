import fs from 'fs';
import path from 'path';

import type { Config, ReferenceGenomes } from './types';
import testConfig from '../tests/config/config.json';
import testReferenceGenomes from '../tests/config/reference-genomes.json';

let _config: Config | null = null;
let _referenceGenomes: ReferenceGenomes | null = null;

export function getConfig(): Config {
    if (_config === null) {
        if (import.meta.env.USE_TEST_CONFIG === 'true' || import.meta.env.USE_TEST_CONFIG === true) {
            _config = testConfig as Config;
        } else {
            const configFilePath = path.join(import.meta.env.CONFIG_DIR, 'config.json');
            _config = JSON.parse(fs.readFileSync(configFilePath, 'utf8')) as Config;
        }
    }
    return _config;
}

export function getReferenceGenomes(): ReferenceGenomes {
    if (_referenceGenomes === null) {
        if (import.meta.env.USE_TEST_CONFIG === 'true' || import.meta.env.USE_TEST_CONFIG === true) {
            _referenceGenomes = testReferenceGenomes as ReferenceGenomes;
        } else {
            const configFilePath = path.join(import.meta.env.CONFIG_DIR, 'reference-genomes.json');
            _referenceGenomes = JSON.parse(fs.readFileSync(configFilePath, 'utf8')) as ReferenceGenomes;
        }
    }
    return _referenceGenomes;
}
