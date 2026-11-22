import type { APIRoute } from 'astro';
import { generators } from 'openid-client';

import { routes } from '../../routes/routes.ts';
import { KeycloakClientManager } from '../../utils/KeycloakClientManager.ts';
import { addAuthRequest } from '../../utils/authRequestCookies.ts';

export const GET: APIRoute = async (context) => {
    const requestedReturnTo = context.url.searchParams.get('returnTo');
    if (requestedReturnTo === null) {
        return new Response('Missing returnTo', { status: 400 });
    }

    const returnTo = new URL(requestedReturnTo, context.url.origin);
    if (returnTo.origin !== context.url.origin) {
        return new Response('Invalid returnTo', { status: 400 });
    }

    const client = await KeycloakClientManager.getClient();
    if (client === undefined) {
        return context.redirect('/503?service=Authentication');
    }

    const state = generators.state();
    const nonce = generators.nonce();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    const callbackUrl = new URL(routes.authCallback(), context.url.origin).toString();
    addAuthRequest(context.cookies, state, nonce, codeVerifier, returnTo.toString());

    /* eslint-disable @typescript-eslint/naming-convention */
    const authorizationUrl = client.authorizationUrl({
        redirect_uri: callbackUrl,
        scope: 'openid',
        response_type: 'code',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
    });
    /* eslint-enable @typescript-eslint/naming-convention */

    return context.redirect(authorizationUrl);
};
