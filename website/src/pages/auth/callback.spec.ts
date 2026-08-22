import type { APIContext } from 'astro';
import { describe, expect, test } from 'vitest';

import { GET } from './callback.ts';

describe('/auth/callback', () => {
    test('fails closed when middleware has not accepted the callback', async () => {
        const response = await GET({} as APIContext);

        expect(response.status).toBe(400);
        expect(await response.text()).toBe('Authentication callback could not be validated.');
    });
});
