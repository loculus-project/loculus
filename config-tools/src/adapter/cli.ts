#!/usr/bin/env node
// Init container that fetches one organism's pinned config from the public API
// and renders the files SILO + LAPIS + preprocessing expect.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { stringify as yamlStringify } from 'yaml';

import { mergeReferenceGenomes } from './referenceGenomes.ts';
import { toSiloDatabaseConfig } from './siloDatabaseConfig.ts';
import { toSiloPreprocessingConfig } from './siloPreprocessingConfig.ts';
import { lineageDefinitionsForOrganism } from './lineageSystems.ts';
import {
    canonicalInstanceResponse,
    canonicalOrganismResponse,
    type CanonicalInstanceResponse,
    type CanonicalOrganismResponse,
} from '../schema/canonicalConfig.ts';

interface ParsedArgs {
    backendUrl: string;
    organismKey: string;
    organismVersion: number;
    instanceVersion: number | null;
    outputDir: string;
}

function usage(): string {
    return `loculus-config-adapter [options]

Required:
  --backend-url <url>                 Base URL of the Loculus backend
  --organism <key>                    Organism key to render
  --organism-version <N>              Pinned organism config version

Optional:
  --instance-version <N>              Pinned instance config version (default: latest)
  --output-dir <dir>                  Output directory (default: /loculus-config)
  --help                              Show this message

Environment fallbacks: LOCULUS_BACKEND_URL, LOCULUS_ORGANISM_KEY,
LOCULUS_ORGANISM_CONFIG_VERSION, LOCULUS_INSTANCE_CONFIG_VERSION,
LOCULUS_CONFIG_OUTPUT_DIR.
`;
}

function parseArgs(argv: string[]): ParsedArgs {
    const env = process.env;
    let backendUrl = env.LOCULUS_BACKEND_URL;
    let organismKey = env.LOCULUS_ORGANISM_KEY;
    let organismVersion = env.LOCULUS_ORGANISM_CONFIG_VERSION;
    let instanceVersion = env.LOCULUS_INSTANCE_CONFIG_VERSION;
    let outputDir = env.LOCULUS_CONFIG_OUTPUT_DIR ?? '/loculus-config';

    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        const next = (): string => {
            const v = argv[++i];
            if (v === undefined) throw new Error(`Missing value for ${arg}`);
            return v;
        };
        switch (arg) {
            case '--backend-url':
                backendUrl = next();
                break;
            case '--organism':
                organismKey = next();
                break;
            case '--organism-version':
                organismVersion = next();
                break;
            case '--instance-version':
                instanceVersion = next();
                break;
            case '--output-dir':
                outputDir = next();
                break;
            case '--help':
            case '-h':
                console.log(usage());
                process.exit(0);
                break;
            default:
                throw new Error(`Unknown argument ${arg}\n\n${usage()}`);
        }
    }

    if (backendUrl === undefined || backendUrl === '') throw new Error('Missing --backend-url');
    if (organismKey === undefined || organismKey === '') throw new Error('Missing --organism');
    if (organismVersion === undefined || organismVersion === '') {
        throw new Error('Missing --organism-version (the adapter requires pinned config for reproducible renders)');
    }
    const parsedOrgVersion = Number.parseInt(organismVersion, 10);
    if (Number.isNaN(parsedOrgVersion) || parsedOrgVersion < 1) {
        throw new Error(`Invalid --organism-version "${organismVersion}"`);
    }
    let parsedInstanceVersion: number | null = null;
    if (instanceVersion !== undefined && instanceVersion !== '') {
        const v = Number.parseInt(instanceVersion, 10);
        if (Number.isNaN(v) || v < 1) throw new Error(`Invalid --instance-version "${instanceVersion}"`);
        parsedInstanceVersion = v;
    }

    return {
        backendUrl,
        organismKey,
        organismVersion: parsedOrgVersion,
        instanceVersion: parsedInstanceVersion,
        outputDir,
    };
}

async function fetchJson(url: string): Promise<unknown> {
    let response: Response;
    try {
        response = await fetch(url, {
            method: 'GET',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            headers: { Accept: 'application/json' },
        });
    } catch (e) {
        throw new Error(`Network error fetching ${url}: ${(e as Error).message}`);
    }
    if (!response.ok) {
        throw new Error(`status ${response.status} fetching ${url}`);
    }
    return response.json();
}

async function fetchInstance(backendUrl: string, version: number | null): Promise<CanonicalInstanceResponse> {
    const base = backendUrl.replace(/\/$/, '');
    const url = version === null ? `${base}/api/config/instance` : `${base}/api/config/instance?version=${version}`;
    return canonicalInstanceResponse.parse(await fetchJson(url));
}

async function fetchOrganism(backendUrl: string, key: string, version: number): Promise<CanonicalOrganismResponse> {
    const base = backendUrl.replace(/\/$/, '');
    const url = `${base}/api/config/organisms/${encodeURIComponent(key)}?version=${version}`;
    return canonicalOrganismResponse.parse(await fetchJson(url));
}

async function writeOutputs(outputDir: string, files: Map<string, string>): Promise<void> {
    // Atomicity comes from init-container ordering, not from rename-into-place:
    // we never `rm` the output dir because in k8s it is the mount point of a
    // shared emptyDir, which the container can't remove.
    await mkdir(outputDir, { recursive: true });
    for (const [name, content] of files) {
        await writeFile(join(outputDir, name), content, 'utf8');
    }
}

async function main(): Promise<number> {
    let args: ParsedArgs;
    try {
        args = parseArgs(process.argv);
    } catch (e) {
        console.error((e as Error).message);
        return 2;
    }

    let instance: CanonicalInstanceResponse;
    let organism: CanonicalOrganismResponse;
    try {
        [instance, organism] = await Promise.all([
            fetchInstance(args.backendUrl, args.instanceVersion),
            fetchOrganism(args.backendUrl, args.organismKey, args.organismVersion),
        ]);
    } catch (e) {
        console.error(`Failed to fetch config: ${(e as Error).message}`);
        return 3;
    }

    console.log(
        `Rendering for ${args.organismKey} v${organism.version} against instance v${instance.version}…`,
    );

    // SILO + LAPIS files only. The Loculus preprocessing pipeline is external
    // and fetches its config from the backend itself (see
    // config-architecture/61_preprocessingPipeline.md); the adapter does not
    // render a pipeline-specific file.
    const files = new Map<string, string>();
    try {
        files.set('database_config.yaml', yamlStringify(toSiloDatabaseConfig(instance.config, organism.config)));
        files.set('reference_genomes.json', JSON.stringify(mergeReferenceGenomes(organism.config), null, 2));
        files.set('preprocessing_config.yaml', yamlStringify(toSiloPreprocessingConfig(organism.config)));
        // Lineage-definition URLs come from the DB instance config. The adapter
        // forwards them; the silo-importer downloads the actual files at import
        // time (it knows the pipeline version of the data it's importing).
        // Always written (possibly `{}`) so the silo-importer's mount always finds a file.
        const lineageDefinitions = lineageDefinitionsForOrganism(instance.config, organism.config);
        files.set('lineage_definitions.json', JSON.stringify(lineageDefinitions, null, 2));
    } catch (e) {
        console.error(`Render failed: ${(e as Error).message}`);
        return 4;
    }

    try {
        await writeOutputs(args.outputDir, files);
    } catch (e) {
        console.error(`Render/write failed: ${(e as Error).message}`);
        return 4;
    }
    console.log(
        `Wrote ${args.outputDir}/{database_config.yaml,reference_genomes.json,` +
            `preprocessing_config.yaml,lineage_definitions.json}`,
    );
    return 0;
}

main().then(
    (code) => process.exit(code),
    (e) => {
        console.error('Unhandled error:', e);
        process.exit(99);
    },
);
