import fs from 'fs';
import path from 'path';

import testConfig from '../tests/config/config.json';

export type Metadata = {
    name: string;
    type: 'string' | 'date' | 'integer' | 'pangoLineage';
};
export type Config = {
    lapisHost: string;
    schema: {
        instanceName: string;
        metadata: Metadata[];
        tableColumns: string[];
        primaryKey: string;
    };
};

let _config: Config | null = null;

export function getConfig(): Config {
    if (_config === null) {
        if (import.meta.env.USE_TEST_CONFIG === 'true') {
            _config = testConfig as Config;
        } else {
            const configFilePath = path.join(import.meta.env.CONFIG_DIR, 'config.json');
            _config = JSON.parse(fs.readFileSync(configFilePath, 'utf8')) as Config;
        }
    }
    return _config;
}
