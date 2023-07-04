import fs from 'fs';
import { parse } from 'yaml';
import path from 'path';

export type Config = {
  lapisHost: string;
  schema: {
    instanceName: string;
    metadata: {
      name: string;
      type: string;
    }[];
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
