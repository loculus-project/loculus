import type { APIRoute } from 'astro';

import { getRuntimeConfig } from '../../config';

export const prerender = false;

/**
 * Dev/CI-only helper for the integration-test CLI bootstrap.
 *
 * Browser sessions now keep their OIDC tokens server-side (see
 * `middleware/sessionStore.ts`), so the integration tests can no longer read the
 * backend access token out of a cookie to seed the CLI keyring. Rather than
 * drive the full device-code flow in every CLI test, this endpoint returns the
 * access token of the *current authenticated session* to that same session.
 *
 * Exposing the token to the browser is exactly what the server-side session
 * design avoids, so this is HARD-DISABLED outside insecure/dev deployments:
 * when `insecureCookies` is false (i.e. production) it 404s and the token never
 * leaves the server. `insecureCookies` is already the project's "this is a
 * non-production dev/CI deployment" switch (true in values_e2e_and_dev.yaml,
 * false in values.yaml).
 */
export const GET: APIRoute = ({ locals }) => {
    if (!getRuntimeConfig().insecureCookies) {
        return new Response('Not found', { status: 404 });
    }

    const accessToken = locals.session?.token?.accessToken;
    if (locals.session?.isLoggedIn !== true || accessToken === undefined) {
        return new Response('Unauthorized', { status: 401 });
    }

    return new Response(JSON.stringify({ accessToken }), {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        headers: { 'Content-Type': 'application/json' },
    });
};
