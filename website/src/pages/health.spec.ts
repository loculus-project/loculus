import { describe, expect, test } from 'vitest';

import { GET } from './health.ts';

describe('health endpoint', () => {
    test('returns 200', async () => {
        const response = GET();

        expect(response.status).toBe(200);
        expect(await response.text()).toBe('ok');
    });
});
