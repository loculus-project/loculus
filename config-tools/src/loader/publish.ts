// Modes:
//   - idempotent (default): skip exact matches; fail if a fixture diverges from
//     what's already published.
//   - fresh-only: fail if any fixture organism already exists. For Helm
//     post-install.
import type { LoadedFixtures } from './fixtures.ts';
import { LoaderAdminClient, AdminApiHttpError } from './adminClient.ts';
import { deepEqualIgnoringUndefined } from './compare.ts';
import type {
    CanonicalInstanceConfig,
    CanonicalOrganismConfig,
} from '../schema/canonicalConfig.ts';

export type LoaderMode = 'idempotent' | 'fresh-only';

export interface PublishOptions {
    mode: LoaderMode;
    dryRun: boolean;
    log?: (msg: string) => void;
}

export interface OrganismResult {
    key: string;
    status: 'created' | 'skipped-equal' | 'published-new-version' | 'failed';
    version?: number;
    reason?: string;
}

export interface InstanceResult {
    status: 'skipped-equal' | 'published-new-version' | 'failed';
    version?: number;
    reason?: string;
}

export interface LoaderResult {
    instance: InstanceResult;
    organisms: OrganismResult[];
    hadFailures: boolean;
}

export async function publishFixtures(
    client: LoaderAdminClient,
    fixtures: LoadedFixtures,
    options: PublishOptions,
): Promise<LoaderResult> {
    const log = options.log ?? ((msg) => console.log(msg));

    const instanceResult = await publishInstance(client, fixtures.instance, options, log);
    const organismResults: OrganismResult[] = [];
    let seedingFailed = false;
    for (const [key, organismConfig] of fixtures.organisms) {
        const result = await publishOrganism(client, key, organismConfig, options, log);
        organismResults.push(result);
        if (result.status !== 'failed') {
            const ok = await seedPreprocessingConfigs(
                client,
                key,
                fixtures.preprocessingConfigs.get(key),
                options,
                log,
            );
            if (!ok) seedingFailed = true;
        }
    }

    const hadFailures =
        instanceResult.status === 'failed' || organismResults.some((r) => r.status === 'failed') || seedingFailed;
    return { instance: instanceResult, organisms: organismResults, hadFailures };
}

/**
 * PUTs each opaque preprocessing config file for an organism. Idempotent: a PUT
 * replaces the current value. Returns false if any write failed.
 */
async function seedPreprocessingConfigs(
    client: LoaderAdminClient,
    key: string,
    configs: Map<number, string> | undefined,
    options: PublishOptions,
    log: (msg: string) => void,
): Promise<boolean> {
    if (configs === undefined || configs.size === 0) return true;
    for (const [version, content] of [...configs.entries()].sort((a, b) => a[0] - b[0])) {
        if (options.dryRun) {
            log(`[dry-run] ${key}: would set preprocessing config for pipeline version ${version}`);
            continue;
        }
        try {
            await client.setPreprocessingConfig(key, version, content);
            log(`${key}: set preprocessing config for pipeline version ${version}`);
        } catch (e) {
            const reason = e instanceof AdminApiHttpError ? `${e.body.error}: ${e.body.message ?? ''}` : String(e);
            log(`${key}: FAILED to set preprocessing config for pipeline version ${version} — ${reason}`);
            return false;
        }
    }
    return true;
}

async function publishInstance(
    client: LoaderAdminClient,
    target: CanonicalInstanceConfig,
    options: PublishOptions,
    log: (msg: string) => void,
): Promise<InstanceResult> {
    try {
        const draft = await client.getInstanceDraft();
        if (draft !== null && deepEqualIgnoringUndefined(draft.config, target)) {
            if (options.mode === 'fresh-only') {
                return {
                    status: 'failed',
                    reason: 'instance draft already exists; fresh-only mode forbids existing state',
                };
            }
            if (options.dryRun) {
                log('[dry-run] instance: would publish existing draft');
                return { status: 'published-new-version' };
            }
            const result = await client.publishInstance();
            log(`instance: published v${result.version} from existing draft`);
            return { status: 'published-new-version', version: result.version };
        }

        if (options.dryRun) {
            log('[dry-run] instance: would PUT draft + publish');
            return { status: 'published-new-version' };
        }
        await client.putInstanceDraft(target);
        const result = await client.publishInstance();
        log(`instance: published v${result.version}`);
        return { status: 'published-new-version', version: result.version };
    } catch (e) {
        const reason = e instanceof AdminApiHttpError ? `${e.body.error}: ${e.body.message ?? ''}` : String(e);
        log(`instance: FAILED — ${reason}`);
        return { status: 'failed', reason };
    }
}

async function publishOrganism(
    client: LoaderAdminClient,
    key: string,
    target: CanonicalOrganismConfig,
    options: PublishOptions,
    log: (msg: string) => void,
): Promise<OrganismResult> {
    try {
        const all = await client.listOrganisms();
        const existing = all.organisms.find((o) => o.key === key);

        if (existing === undefined) {
            if (options.dryRun) {
                log(`[dry-run] ${key}: would create + publish v1`);
                return { key, status: 'created' };
            }
            await client.createOrganism(key);
            await client.putOrganismDraft(key, target);
            const result = await client.publishOrganism(key);
            await client.markOrganismDeployed(key);
            log(`${key}: created, published v1, and marked deployed`);
            return { key, status: 'created', version: result.version };
        }

        if (options.mode === 'fresh-only') {
            return {
                key,
                status: 'failed',
                reason: 'organism already exists; fresh-only mode forbids existing state',
            };
        }

        if (existing.status === 'unreleased') {
            if (options.dryRun) {
                log(`[dry-run] ${key}: would PUT draft on existing unreleased organism + publish v1`);
                return { key, status: 'created' };
            }
            await client.putOrganismDraft(key, target);
            const result = await client.publishOrganism(key);
            await client.markOrganismDeployed(key);
            log(`${key}: published v1 (unreleased → released) and marked deployed`);
            return { key, status: 'created', version: result.version };
        }

        const draft = await client.getOrganismDraft(key);
        const currentConfig = draft?.config;
        if (currentConfig !== undefined && deepEqualIgnoringUndefined(currentConfig, target)) {
            if (options.dryRun) {
                log(`[dry-run] ${key}: draft already matches — would publish next version`);
                return { key, status: 'published-new-version' };
            }
            const result = await client.publishOrganism(key);
            log(`${key}: published v${result.version} from existing matching draft`);
            return { key, status: 'published-new-version', version: result.version };
        }

        if (draft === null) {
            // Absence of a draft is treated as "already in the target state" —
            // the loader cannot compare against the published version directly.
            log(`${key}: no draft; assuming current published version matches — skipping`);
            return { key, status: 'skipped-equal' };
        }

        // Released organism whose draft diverges from the fixture: the loader
        // does not overwrite a released config — resolve it in the admin UI.
        return {
            key,
            status: 'failed',
            reason: 'released organism has a divergent draft; resolve it in the admin UI',
        };
    } catch (e) {
        const reason = e instanceof AdminApiHttpError ? `${e.body.error}: ${e.body.message ?? ''}` : String(e);
        log(`${key}: FAILED — ${reason}`);
        return { key, status: 'failed', reason };
    }
}

export function summariseResult(result: LoaderResult): string {
    const lines: string[] = [];
    lines.push(`Instance: ${result.instance.status}` + (result.instance.version ? ` (v${result.instance.version})` : ''));
    const counts = result.organisms.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
    }, {});
    for (const [status, n] of Object.entries(counts)) {
        lines.push(`Organisms ${status}: ${n}`);
    }
    return lines.join('\n');
}
