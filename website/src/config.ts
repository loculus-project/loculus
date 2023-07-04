import fs from 'fs';
import path from 'path';

import { parse } from 'yaml';

export type Metadata = {
    name: string;
    type: 'string' | 'date' | 'integer' | 'pangoLineage';
};
export type Config = {
    lapisHost: string;
    schema: {
        instanceName: string;
        metadata: Metadata[];
        primaryKey: string;
    };
};

let _config: Config | null = null;

export function getConfig(): Config {
    if (_config === null) {
        const configFilePath = path.join(import.meta.env.CONFIG_DIR, 'config.yml');
        _config = parse(fs.readFileSync(configFilePath, 'utf8')) as Config;
    }
    return _config;
}
