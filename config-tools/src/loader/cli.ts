#!/usr/bin/env node
// Posts fixture YAML to the Loculus admin config API. See ./publish.ts for the
// per-mode semantics.
import { readFile } from 'node:fs/promises';

import { loadFixtures } from './fixtures.ts';
import { LoaderAdminClient } from './adminClient.ts';
import { type LoaderMode, publishFixtures, summariseResult } from './publish.ts';

interface ParsedArgs {
    backendUrl: string;
    accessToken: string;
    fixturesDir: string;
    mode: LoaderMode;
    dryRun: boolean;
}

function usage(): string {
    return `loculus-config-loader [options]

Required:
  --backend-url <url>           Base URL of the Loculus backend (e.g. http://localhost:8079)
  --fixtures <dir>              Directory containing instance.yaml + organisms/*.yaml
  --admin-token <token>         Keycloak access token (loculus_administrator role required)
  --admin-token-file <path>     ...or read the token from a file (one of --admin-token or --admin-token-file required)

Optional:
  --mode <idempotent|fresh-only>             Default: idempotent
  --dry-run                                  Print what would happen without making changes
  --help                                     Show this message

Environment variables (used when the matching flag is omitted):
  LOCULUS_BACKEND_URL, LOCULUS_FIXTURES_DIR, LOCULUS_ADMIN_TOKEN, LOCULUS_ADMIN_TOKEN_FILE
`;
}

async function parseArgs(argv: string[]): Promise<ParsedArgs> {
    const args: Partial<ParsedArgs> & { tokenFile?: string } = {
        backendUrl: process.env.LOCULUS_BACKEND_URL,
        fixturesDir: process.env.LOCULUS_FIXTURES_DIR,
        accessToken: process.env.LOCULUS_ADMIN_TOKEN,
        tokenFile: process.env.LOCULUS_ADMIN_TOKEN_FILE,
        mode: 'idempotent',
        dryRun: false,
    };

    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        const next = (): string => {
            const v = argv[++i];
            if (v === undefined) throw new Error(`Missing value for ${arg}`);
            return v;
        };
        switch (arg) {
            case '--backend-url':
                args.backendUrl = next();
                break;
            case '--fixtures':
                args.fixturesDir = next();
                break;
            case '--admin-token':
                args.accessToken = next();
                break;
            case '--admin-token-file':
                args.tokenFile = next();
                break;
            case '--mode': {
                const m = next();
                if (m !== 'idempotent' && m !== 'fresh-only') {
                    throw new Error(`Unknown --mode ${m}; expected idempotent|fresh-only`);
                }
                args.mode = m;
                break;
            }
            case '--dry-run':
                args.dryRun = true;
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

    if (args.backendUrl === undefined) throw new Error('Missing --backend-url (or LOCULUS_BACKEND_URL)');
    if (args.fixturesDir === undefined) throw new Error('Missing --fixtures (or LOCULUS_FIXTURES_DIR)');
    if (args.accessToken === undefined && args.tokenFile !== undefined) {
        args.accessToken = (await readFile(args.tokenFile, 'utf8')).trim();
    }
    if (args.accessToken === undefined) {
        throw new Error('Missing --admin-token / --admin-token-file (or LOCULUS_ADMIN_TOKEN[_FILE])');
    }
    return args as ParsedArgs;
}

async function main(): Promise<number> {
    let args: ParsedArgs;
    try {
        args = await parseArgs(process.argv);
    } catch (e) {
        console.error((e as Error).message);
        return 2;
    }

    let fixtures;
    try {
        fixtures = await loadFixtures(args.fixturesDir);
    } catch (e) {
        console.error(`Failed to load fixtures from ${args.fixturesDir}:`);
        console.error((e as Error).message);
        return 3;
    }
    console.log(
        `Loaded fixtures: 1 instance config + ${fixtures.organisms.size} organism(s) (${[
            ...fixtures.organisms.keys(),
        ].join(', ')})`,
    );

    const client = new LoaderAdminClient({
        backendUrl: args.backendUrl,
        accessToken: args.accessToken,
    });

    const result = await publishFixtures(client, fixtures, {
        mode: args.mode,
        dryRun: args.dryRun,
    });

    console.log('\n' + summariseResult(result));

    if (result.hadFailures) {
        console.error('\nLoader finished with failures:');
        if (result.instance.status === 'failed') console.error(`  instance: ${result.instance.reason}`);
        for (const o of result.organisms.filter((x) => x.status === 'failed')) {
            console.error(`  ${o.key}: ${o.reason}`);
        }
        return 1;
    }
    return 0;
}

main().then(
    (code) => process.exit(code),
    (e) => {
        console.error('Unhandled error:', e);
        process.exit(99);
    },
);
