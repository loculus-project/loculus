import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminConfigClient, AdminConfigError } from './adminConfigClient.ts';
import {
    adminOrganismsListResponse,
    auditResponse,
    instanceDraftResponse,
    organismDraftResponse,
    operationRequest,
    publishResponse,
} from '../types/loculusConfig.ts';

describe('admin config schemas', () => {
    it('parses an organism listing response', () => {
        const raw = {
            organisms: [
                { key: 'dummy-organism', status: 'released', currentVersion: 3, deployed: true },
                { key: 'new-organism', status: 'unreleased', currentVersion: null, deployed: false },
            ],
        };
        const parsed = adminOrganismsListResponse.parse(raw);
        expect(parsed.organisms).toHaveLength(2);
        expect(parsed.organisms[1].status).toBe('unreleased');
    });

    it('parses an organism draft response', () => {
        const raw = {
            config: {
                schema: { organismName: 'Test', metadata: [] },
                referenceGenome: { nucleotideSequences: [{ name: 'main', sequence: 'ATG' }], genes: [] },
            },
            baseVersion: 2,
            revision: 5,
            operations: [
                {
                    opType: 'setOrganismDisplay',
                    summary: "Set organism display: displayName='Foo'",
                    appliedAt: '2026-05-24T10:00:00',
                    appliedBy: 'alice',
                },
            ],
        };
        const parsed = organismDraftResponse.parse(raw);
        expect(parsed.revision).toBe(5);
        expect(parsed.operations[0].opType).toBe('setOrganismDisplay');
    });

    it('parses an instance draft response', () => {
        const raw = {
            config: {
                name: 'Loculus',
                accessionPrefix: 'LOC_',
                dataUseTerms: { enabled: false, urls: null },
                fileSharing: { outputFileUrlType: 'website' },
            },
            baseVersion: 1,
            revision: 2,
        };
        const parsed = instanceDraftResponse.parse(raw);
        expect(parsed.config.name).toBe('Loculus');
    });

    it('parses a publish response', () => {
        const raw = {
            version: 7,
            previousVersion: 6,
            publishedAt: '2026-05-24T10:00:00',
            publishedBy: 'alice',
        };
        const parsed = publishResponse.parse(raw);
        expect(parsed.version).toBe(7);
    });

    it('parses an operation request with the backend wire shape', () => {
        const parsed = operationRequest.parse({
            type: 'setOrganismDisplay',
            payload: { displayName: 'Foo' },
        });
        expect(parsed.type).toBe('setOrganismDisplay');
    });

    it('parses an audit response', () => {
        const raw = {
            entries: [
                {
                    id: 42,
                    occurredAt: '2026-05-24T10:00:00',
                    actor: 'alice',
                    scope: 'organism',
                    organismKey: 'dummy-organism',
                    action: 'publish',
                    details: { revision: 3 },
                    resultVersion: 3,
                },
            ],
        };
        const parsed = auditResponse.parse(raw);
        expect(parsed.entries[0].action).toBe('publish');
    });
});

describe('AdminConfigClient HTTP behaviour', () => {
    const backendUrl = 'https://backend.test';

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function jsonResponse(body: unknown, status = 200): Response {
        return new Response(JSON.stringify(body), {
            status,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            headers: { 'Content-Type': 'application/json' },
        });
    }

    it('sends the access token as Bearer auth and parses the response', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(
                jsonResponse({ organisms: [{ key: 'foo', status: 'released', currentVersion: 1, deployed: true }] }),
            );

        const client = new AdminConfigClient('TOKEN', backendUrl);
        const result = await client.listOrganisms();

        expect(result.organisms).toHaveLength(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://backend.test/api/admin/config/organisms');
        expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN');
    });

    it('forwards If-Match on operation append', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ revision: 7 }));

        const client = new AdminConfigClient('TOKEN', backendUrl);
        await client.appendOrganismOperation('foo', { type: 'setOrganismDisplay', payload: {} }, 6);

        const [, init] = fetchMock.mock.calls[0];
        const headers = init?.headers as Record<string, string>;
        expect(headers['If-Match']).toBe('6');
        expect(headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(init?.body as string)).toEqual({
            operations: [{ type: 'setOrganismDisplay', payload: {} }],
        });
    });

    it('maps a structured 409 into an AdminConfigError', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            jsonResponse({ error: 'revision_conflict', message: 'If-Match=2 but current is 3' }, 409),
        );

        const client = new AdminConfigClient('TOKEN', backendUrl);
        await expect(
            client.appendOrganismOperation('foo', { type: 'setOrganismDisplay', payload: {} }, 2),
        ).rejects.toMatchObject({
            name: 'AdminConfigError',
            status: 409,
            body: { error: 'revision_conflict' },
        });
    });

    it('treats 204 No Content as a null draft', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
        const client = new AdminConfigClient('TOKEN', backendUrl);
        await expect(client.getOrganismDraft('foo')).resolves.toBeNull();
    });

    it('marks an organism deployed', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(jsonResponse({ key: 'foo', status: 'released', currentVersion: 1, deployed: true }));

        const client = new AdminConfigClient('TOKEN', backendUrl);
        const result = await client.markOrganismDeployed('foo');

        expect(result.deployed).toBe(true);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://backend.test/api/admin/config/organisms/foo/mark-deployed');
        expect(init?.method).toBe('POST');
    });

    it('AdminConfigError.isInstance discriminates the typed error', () => {
        const err = new AdminConfigError(409, { error: 'revision_conflict' });
        expect(AdminConfigError.isInstance(err)).toBe(true);
        expect(AdminConfigError.isInstance(new Error('plain'))).toBe(false);
    });
});
