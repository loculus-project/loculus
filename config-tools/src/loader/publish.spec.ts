import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoaderAdminClient } from './adminClient.ts';
import type { LoadedFixtures } from './fixtures.ts';
import { publishFixtures } from './publish.ts';
import {
    canonicalInstanceConfig,
    canonicalOrganismConfig,
    type CanonicalInstanceConfig,
    type CanonicalOrganismConfig,
} from '../schema/canonicalConfig.ts';

const backendUrl = 'https://backend.test';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        headers: { 'Content-Type': 'application/json' },
    });
}

const sampleInstance: CanonicalInstanceConfig = canonicalInstanceConfig.parse({
    name: 'Loculus',
    accessionPrefix: 'LOC_',
    dataUseTerms: { enabled: false, urls: null },
    fileSharing: { outputFileUrlType: 'website' },
});

const sampleOrganism: CanonicalOrganismConfig = canonicalOrganismConfig.parse({
    schema: { organismName: 'Test', metadata: [{ name: 'date', type: 'date' }] },
    referenceGenome: { nucleotideSequences: [{ name: 'main', sequence: 'ATG' }], genes: [] },
});

const sampleFixtures: LoadedFixtures = {
    instance: sampleInstance,
    organisms: new Map([['new-organism', sampleOrganism]]),
    preprocessingConfigs: new Map(),
};

describe('publishFixtures', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('creates + publishes a fresh organism end-to-end in idempotent mode', async () => {
        // Mock backend: empty initial state for instance draft and organism listing,
        // then accept the PUT/POST/publish sequence for both instance and the new organism.
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        fetchMock
            // instance draft fetch: 204 (no draft yet)
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
            // published instance config differs from the fixture → not idempotent-skippable
            .mockResolvedValueOnce(jsonResponse({ config: { ...sampleInstance, name: 'Different instance' } }))
            // instance PUT draft → revision 1
            .mockResolvedValueOnce(jsonResponse({ revision: 1 }))
            // instance publish → v1
            .mockResolvedValueOnce(jsonResponse({ version: 1, previousVersion: null, publishedAt: 'now', publishedBy: 'loader' }))
            // organism list → empty
            .mockResolvedValueOnce(jsonResponse({ organisms: [] }))
            // POST create organism
            .mockResolvedValueOnce(jsonResponse({ key: 'new-organism', status: 'unreleased', currentVersion: null, deployed: false }))
            // PUT draft
            .mockResolvedValueOnce(jsonResponse({ revision: 1 }))
            // publish → v1
            .mockResolvedValueOnce(jsonResponse({ version: 1, previousVersion: null, publishedAt: 'now', publishedBy: 'loader' }))
            // mark deployed
            .mockResolvedValueOnce(jsonResponse({ key: 'new-organism', status: 'released', currentVersion: 1, deployed: true }));

        const client = new LoaderAdminClient({ backendUrl, accessToken: 'TOKEN' });
        const result = await publishFixtures(client, sampleFixtures, {
            mode: 'idempotent',
            dryRun: false,
            log: () => undefined,
        });

        expect(result.hadFailures).toBe(false);
        expect(result.instance.status).toBe('published-new-version');
        expect(result.organisms[0].status).toBe('created');
        expect(result.organisms[0].version).toBe(1);
    });

    it('fresh-only mode fails fast when an organism already exists', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        fetchMock
            // instance draft fetch: 204
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
            // instance PUT + publish (instance is allowed in fresh-only since the migration default isn't "customised")
            .mockResolvedValueOnce(jsonResponse({ revision: 1 }))
            .mockResolvedValueOnce(jsonResponse({ version: 1, previousVersion: null, publishedAt: 'now', publishedBy: 'loader' }))
            // organism list shows the target key already released
            .mockResolvedValueOnce(
                jsonResponse({
                    organisms: [{ key: 'new-organism', status: 'released', currentVersion: 1, deployed: true }],
                }),
            );

        const client = new LoaderAdminClient({ backendUrl, accessToken: 'TOKEN' });
        const result = await publishFixtures(client, sampleFixtures, {
            mode: 'fresh-only',
            dryRun: false,
            log: () => undefined,
        });

        expect(result.hadFailures).toBe(true);
        expect(result.organisms[0].status).toBe('failed');
        expect(result.organisms[0].reason).toContain('fresh-only');
    });

    it('idempotent mode skips an organism whose existing release already matches the fixture', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        fetchMock
            // instance draft: existing draft equal to target → publish it
            .mockResolvedValueOnce(jsonResponse({ config: sampleInstance, baseVersion: 1, revision: 1 }))
            .mockResolvedValueOnce(jsonResponse({ version: 2, previousVersion: 1, publishedAt: 'now', publishedBy: 'loader' }))
            // organism list: already released
            .mockResolvedValueOnce(
                jsonResponse({
                    organisms: [{ key: 'new-organism', status: 'released', currentVersion: 1, deployed: true }],
                }),
            )
            // organism draft: 204 → no pending changes, idempotent skip
            .mockResolvedValueOnce(new Response(null, { status: 204 }));

        const client = new LoaderAdminClient({ backendUrl, accessToken: 'TOKEN' });
        const result = await publishFixtures(client, sampleFixtures, {
            mode: 'idempotent',
            dryRun: false,
            log: () => undefined,
        });

        expect(result.hadFailures).toBe(false);
        expect(result.organisms[0].status).toBe('skipped-equal');
    });

    it('idempotent mode skips re-publishing the instance when the published config already matches', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        fetchMock
            // instance draft fetch: 204 (no draft)
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
            // published instance config equals the fixture → idempotent skip, no PUT/publish
            .mockResolvedValueOnce(jsonResponse({ config: sampleInstance }))
            // organism list: already released and matching
            .mockResolvedValueOnce(
                jsonResponse({
                    organisms: [{ key: 'new-organism', status: 'released', currentVersion: 1, deployed: true }],
                }),
            )
            // organism draft: 204 → idempotent skip
            .mockResolvedValueOnce(new Response(null, { status: 204 }));

        const client = new LoaderAdminClient({ backendUrl, accessToken: 'TOKEN' });
        const result = await publishFixtures(client, sampleFixtures, {
            mode: 'idempotent',
            dryRun: false,
            log: () => undefined,
        });

        expect(result.hadFailures).toBe(false);
        expect(result.instance.status).toBe('skipped-equal');
        // No instance PUT/publish happened — only GETs for the instance.
        const methodsCalled = fetchMock.mock.calls.map((c) => (c[1] as RequestInit | undefined)?.method);
        expect(methodsCalled.every((m) => m === 'GET' || m === undefined)).toBe(true);
    });

    it('seeds preprocessing config files after publishing the organism', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        fetchMock
            // instance draft fetch: 204 (no draft yet)
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
            // published instance config differs from the fixture → not idempotent-skippable
            .mockResolvedValueOnce(jsonResponse({ config: { ...sampleInstance, name: 'Different instance' } }))
            // instance PUT draft → revision 1
            .mockResolvedValueOnce(jsonResponse({ revision: 1 }))
            // instance publish → v1
            .mockResolvedValueOnce(jsonResponse({ version: 1, previousVersion: null, publishedAt: 'now', publishedBy: 'loader' }))
            // organism list → empty
            .mockResolvedValueOnce(jsonResponse({ organisms: [] }))
            // POST create organism
            .mockResolvedValueOnce(jsonResponse({ key: 'new-organism', status: 'unreleased', currentVersion: null, deployed: false }))
            // PUT draft
            .mockResolvedValueOnce(jsonResponse({ revision: 1 }))
            // publish → v1
            .mockResolvedValueOnce(jsonResponse({ version: 1, previousVersion: null, publishedAt: 'now', publishedBy: 'loader' }))
            // mark deployed
            .mockResolvedValueOnce(jsonResponse({ key: 'new-organism', status: 'released', currentVersion: 1, deployed: true }))
            // PUT preprocessing config v1 → 204
            .mockResolvedValueOnce(new Response(null, { status: 204 }));

        const fixtures: LoadedFixtures = {
            instance: sampleInstance,
            organisms: new Map([['new-organism', sampleOrganism]]),
            preprocessingConfigs: new Map([['new-organism', new Map([[1, 'batch_size: 50\n']])]]),
        };

        const client = new LoaderAdminClient({ backendUrl, accessToken: 'TOKEN' });
        const result = await publishFixtures(client, fixtures, {
            mode: 'idempotent',
            dryRun: false,
            log: () => undefined,
        });

        expect(result.hadFailures).toBe(false);
        const lastCall = fetchMock.mock.calls.at(-1)!;
        expect(lastCall[0]).toBe(`${backendUrl}/api/admin/config/organisms/new-organism/preprocessing/1`);
        const init = lastCall[1] as RequestInit;
        expect(init.method).toBe('PUT');
        expect(init.body).toBe('batch_size: 50\n');
        expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain');
    });

    it('dry-run mode makes no PUT/POST/publish calls', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        fetchMock
            // instance draft fetch: 204
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
            // published instance config differs → would PUT+publish, but dry-run short-circuits
            .mockResolvedValueOnce(jsonResponse({ config: { ...sampleInstance, name: 'Different instance' } }))
            // organism list: empty
            .mockResolvedValueOnce(jsonResponse({ organisms: [] }));

        const client = new LoaderAdminClient({ backendUrl, accessToken: 'TOKEN' });
        const result = await publishFixtures(client, sampleFixtures, {
            mode: 'idempotent',
            dryRun: true,
            log: () => undefined,
        });

        expect(result.hadFailures).toBe(false);
        // Only the two GETs happened — no PUTs / POSTs.
        const methodsCalled = fetchMock.mock.calls.map((c) => (c[1] as RequestInit | undefined)?.method);
        expect(methodsCalled.every((m) => m === 'GET' || m === undefined)).toBe(true);
    });
});
