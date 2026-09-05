import type { APIContext } from 'astro';
import { describe, expect, test, vi } from 'vitest';

import { GET } from './callback.ts';

describe('/auth/callback', () => {
    test('fails closed when middleware has not accepted the callback', async () => {
        const response = await GET({
            redirect: vi.fn((location: string) => new Response(null, { status: 302, headers: { location } })),
        } as unknown as APIContext);

        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('/auth/login-failed');
    });
});
