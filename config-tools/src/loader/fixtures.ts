// Reads loader fixtures from disk: an `instance.yaml` plus an `organisms/`
// directory. Validates each file against the canonical Zod schema.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import {
    canonicalInstanceConfig,
    canonicalOrganismConfig,
    type CanonicalInstanceConfig,
    type CanonicalOrganismConfig,
} from '../schema/canonicalConfig.ts';

export interface LoadedFixtures {
    instance: CanonicalInstanceConfig;
    organisms: Map<string, CanonicalOrganismConfig>;
    // Opaque config files keyed by organism then pipeline version, read verbatim
    // from `preprocessing/<organism>/<version>.<ext>`.
    preprocessingConfigs: Map<string, Map<number, string>>;
}

async function readYamlFile<T>(path: string, parser: (raw: unknown) => T): Promise<T> {
    const raw = await readFile(path, 'utf8');
    let parsed: unknown;
    try {
        parsed = parseYaml(raw);
    } catch (e) {
        throw new Error(`Failed to parse YAML at ${path}: ${(e as Error).message}`);
    }
    try {
        return parser(parsed);
    } catch (e) {
        if (e instanceof z.ZodError) {
            throw new Error(
                `Schema validation failed for ${path}:\n` +
                    e.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'),
            );
        }
        throw e;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeLegacyMetadataAdd(raw: unknown): unknown {
    if (!isRecord(raw) || !isRecord(raw.schema)) return raw;
    const { schema } = raw;
    if (!Array.isArray(schema.metadata) || !Array.isArray(schema.metadataAdd)) return raw;

    const metadataByName = new Map<string, Record<string, unknown>>();
    for (const field of schema.metadata) {
        if (isRecord(field) && typeof field.name === 'string') {
            metadataByName.set(field.name, field);
        }
    }

    for (const field of schema.metadataAdd) {
        if (!isRecord(field) || typeof field.name !== 'string') continue;
        const existing = metadataByName.get(field.name);
        if (existing !== undefined) {
            Object.assign(existing, field);
        }
    }

    delete schema.metadataAdd;
    return raw;
}

export async function loadFixtures(dir: string): Promise<LoadedFixtures> {
    const instancePath = join(dir, 'instance.yaml');
    const instance = await readYamlFile(instancePath, (raw) => canonicalInstanceConfig.parse(raw));

    const organismsDir = join(dir, 'organisms');
    let organismFiles: string[];
    try {
        organismFiles = (await readdir(organismsDir))
            .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
            .sort();
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
            return { instance, organisms: new Map(), preprocessingConfigs: new Map() };
        }
        throw e;
    }

    const organisms = new Map<string, CanonicalOrganismConfig>();
    for (const filename of organismFiles) {
        const key = filename.replace(/\.ya?ml$/, '');
        const config = await readYamlFile(join(organismsDir, filename), (raw) =>
            canonicalOrganismConfig.parse(normalizeLegacyMetadataAdd(raw)),
        );
        organisms.set(key, config);
    }

    const preprocessingConfigs = await loadPreprocessingConfigs(join(dir, 'preprocessing'));
    return { instance, organisms, preprocessingConfigs };
}

/**
 * Reads `preprocessing/<organism>/<version>.<ext>` files verbatim. The file
 * stem must be the integer pipeline version; the content is opaque and stored
 * as-is. Returns an empty map if the directory is absent.
 */
async function loadPreprocessingConfigs(preprocessingDir: string): Promise<Map<string, Map<number, string>>> {
    const result = new Map<string, Map<number, string>>();
    let organismDirs: import('node:fs').Dirent[];
    try {
        organismDirs = (await readdir(preprocessingDir, { withFileTypes: true })).filter((d) => d.isDirectory());
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return result;
        throw e;
    }

    for (const organismDir of organismDirs.sort((a, b) => a.name.localeCompare(b.name))) {
        const organismKey = organismDir.name;
        const versionFiles = (await readdir(join(preprocessingDir, organismKey))).sort();
        const byVersion = new Map<number, string>();
        for (const filename of versionFiles) {
            const stem = filename.replace(/\.[^.]+$/, '');
            const pipelineVersion = Number(stem);
            if (!Number.isInteger(pipelineVersion) || pipelineVersion < 1) {
                throw new Error(
                    `Invalid preprocessing config filename '${filename}' in ${organismKey}: ` +
                        `the file stem must be a positive integer pipeline version (e.g. '1.yaml').`,
                );
            }
            const content = await readFile(join(preprocessingDir, organismKey, filename), 'utf8');
            byVersion.set(pipelineVersion, content);
        }
        if (byVersion.size > 0) result.set(organismKey, byVersion);
    }
    return result;
}
