import type { APIContext } from 'astro';
import { err, ok, type Result } from 'neverthrow';
import { describe, expect, test, vi } from 'vitest';

import { createDownloadAPIRoute, type DataDownloader } from './createDownloadAPIRoute';
import { type ProblemDetail } from '../types/backend';

vi.mock('../config', () => ({
    getConfiguredOrganisms: () => [{ key: 'ebola' }, { key: 'otherOrganism' }],
}));

vi.mock('../services/lapisClient', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    LapisClient: { createForOrganism: () => ({}) },
}));

const problem = (status: number): ProblemDetail => ({
    type: 'about:blank',
    title: 'Problem',
    status,
    detail: `LAPIS answered ${status}`,
    instance: 'test',
});

const fastaData = '>LOC_0001.1\nACGT\n';

function createRoute(getData: DataDownloader) {
    return createDownloadAPIRoute('text/x-fasta', 'fa', () => '/seq/LOC_0001.1', getData);
}

function callRoute(
    route: ReturnType<typeof createRoute>,
    session: Session,
    requestHeaders: Record<string, string> = {},
): Promise<Response> {
    const request = new Request('http://website/seq/LOC_0001.1.fa', { headers: requestHeaders });
    return route({
        params: { accessionVersion: 'LOC_0001.1' },
        redirect: vi.fn(),
        request,
        locals: { session },
    } as unknown as APIContext) as Promise<Response>;
}

const loggedInSession: Session = {
    isLoggedIn: true,
    token: { accessToken: 'session-token', refreshToken: 'refresh-token' },
};

describe('createDownloadAPIRoute', () => {
    test('passes a Bearer token from the request to the data getter', async () => {
        const getData = vi.fn<DataDownloader>(() => Promise.resolve(ok(fastaData)));

        const response = await callRoute(
            createRoute(getData),
            { isLoggedIn: false },
            {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                Authorization: 'Bearer api-client-token',
            },
        );

        expect(response.status).toBe(200);
        expect(getData).toHaveBeenCalledWith('LOC_0001.1', 'ebola', 'api-client-token');
    });

    test('falls back to the session token without a Bearer token', async () => {
        const getData = vi.fn<DataDownloader>(() => Promise.resolve(ok(fastaData)));

        await callRoute(createRoute(getData), loggedInSession);

        expect(getData).toHaveBeenCalledWith('LOC_0001.1', 'ebola', 'session-token');
    });

    test('answers 401 when every organism rejects the token', async () => {
        const getData = vi.fn<DataDownloader>(() => Promise.resolve<Result<string, ProblemDetail>>(err(problem(401))));

        const response = await callRoute(
            createRoute(getData),
            { isLoggedIn: false },
            {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                Authorization: 'Bearer invalid-token',
            },
        );

        expect(response.status).toBe(401);
    });

    test('answers 404 when the sequence cannot be found in any organism', async () => {
        const getData = vi.fn<DataDownloader>(() => Promise.resolve<Result<string, ProblemDetail>>(err(problem(500))));

        const response = await callRoute(createRoute(getData), { isLoggedIn: false });

        expect(response.status).toBe(404);
    });

    test('answers 404 when one organism rejects the token and the other has no such sequence', async () => {
        const getData = vi.fn<DataDownloader>((_accessionVersion, organism) =>
            Promise.resolve<Result<string, ProblemDetail>>(
                organism === 'ebola' ? err(problem(401)) : ok('>header only\n'),
            ),
        );

        const response = await callRoute(createRoute(getData), { isLoggedIn: false });

        expect(response.status).toBe(404);
    });
});
