import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getWebsiteConfig: vi.fn(),
    getRuntimeConfig: vi.fn(),
    loggerError: vi.fn(),
}));

vi.mock('../config.ts', () => ({
    getWebsiteConfig: mocks.getWebsiteConfig,
    getRuntimeConfig: mocks.getRuntimeConfig,
}));

vi.mock('../logger.ts', () => ({
    getInstanceLogger: () => ({ error: mocks.loggerError }),
}));

import { GET } from './health.ts';

describe('health endpoint', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    test('returns 200 when the config loads', async () => {
        const response = GET();

        expect(response.status).toBe(200);
        expect(await response.text()).toBe('ok');
    });

    test('returns 503 without error details when the website config is invalid', async () => {
        mocks.getWebsiteConfig.mockImplementation(() => {
            throw new Error('secret detail');
        });

        const response = GET();

        expect(response.status).toBe(503);
        expect(await response.text()).toBe('config error');
        expect(mocks.loggerError).toHaveBeenCalledWith(expect.stringContaining('secret detail'));
    });

    test('returns 503 when the runtime config is invalid', () => {
        mocks.getRuntimeConfig.mockImplementation(() => {
            throw new Error('bad runtime config');
        });

        expect(GET().status).toBe(503);
    });
});
