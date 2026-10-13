import { expect } from '@playwright/test';

import { test } from '../../fixtures/console-warnings.fixture';
import {
    isLapisAuthenticationEnabled,
    isLocalDeployment,
    loginTestUserWithCookies,
} from '../../utils/lapisAuth';
import { AuthPage } from '../../pages/auth.page';
import { SearchPage } from '../../pages/search.page';
import { SequenceDetailPage } from '../../pages/sequence-detail.page';
import { readonlyUser } from '../../fixtures/user.fixture';

/**
 * Verifies that the website serves released data end to end while LAPIS requires
 * authentication (`lapis.auth.enabled` in `values_e2e_and_dev.yaml`:
 * data access on the website is bound to the logged-in user's session.
 *
 * - anonymous visitors are redirected to the login page when they open a data page (middleware
 *   gate) and get a 401 from the same-origin `/api/lapis/<organism>` proxy,
 * - the search page loads results through the proxy, which forwards the *user's* token,
 * - the sequence detail page loads (server-side LAPIS requests with the user's token),
 * - the `.fa` and `.tsv` downloads work (server-side download routes with the user's token).
 *
 * These are dependent specs: they need the released sequences set up by `readonly.setup.ts`.
 */

test.describe('Website data access with LAPIS authentication', () => {
    /**
     * Skips the gating assertions on remote deployments without LAPIS auth (they still serve
     * data pages anonymously); fails hard in the e2e/dev environment when auth is off there.
     */
    async function expectLapisAuthenticationOrSkipOnRemote(page: import('@playwright/test').Page) {
        const authEnabled = await isLapisAuthenticationEnabled(page.request, 'dummy-organism');
        test.skip(
            !authEnabled && !isLocalDeployment(),
            'LAPIS authentication is not enabled on this remote deployment (not rolled out yet)',
        );
        expect(
            authEnabled,
            'LAPIS must require authentication here: check lapis.auth.enabled in the deployment ' +
                'values and the jwk-set-uri argument of the LAPIS deployment',
        ).toBe(true);
    }

    test('anonymous visitors are redirected to the login page on data routes', async ({ page }) => {
        await expectLapisAuthenticationOrSkipOnRemote(page);

        // No login here: this test deliberately browses anonymously.

        // The homepage is a data page (per-organism sequence counts): anonymous visitors are
        // redirected to Keycloak instead of seeing it.
        await page.goto('/');
        await expect(page).toHaveURL(/\/realms\/loculus\//);

        // The LAPIS proxy requires a session and answers 401 for anonymous API callers
        // (fetch/XHR callers must not be redirected to an HTML login page).
        const proxyResponse = await page.request.get(
            '/api/lapis/ebola-sudan/sample/details?limit=1',
        );
        expect(proxyResponse.status()).toBe(401);
    });

    test('homepage statistics and search results render for a logged-in user', async ({ page }) => {
        await loginTestUserWithCookies(page);

        // Homepage: the per-organism sequence counts come from server-side LAPIS requests
        // carrying the user's token. A failed/timed-out fetch renders the -1 sentinel, so
        // assert an actual positive count: the readonly setup guarantees released sequences.
        await page.goto('/');
        const ebolaSudanCard = page.getByRole('link', { name: /Ebola Sudan/ }).first();
        await expect(ebolaSudanCard).toBeVisible();
        await expect(ebolaSudanCard.locator('span.font-bold')).toHaveText(/^\d[\d,]*$/);

        // Search page: browser-side LAPIS traffic goes through the same-origin proxy, which
        // forwards the logged-in user's token.
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();
        await searchPage.waitForSequencesInSearch(1);
    });

    test('detail pages and downloads work for a logged-in user', async ({ page, baseURL }) => {
        const authPage = new AuthPage(page);
        await authPage.login(readonlyUser.username, readonlyUser.password);

        // Search page through the same-origin proxy.
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();
        const accessionVersions = await searchPage.waitForSequencesInSearch(1);
        const { accessionVersion } = accessionVersions[0];

        // Detail page: server-side LAPIS requests with the user's token.
        const detailPage = new SequenceDetailPage(page);
        await detailPage.goto(accessionVersion);
        await detailPage.waitForSequenceTabs();
        await detailPage.selectUnalignedTab();
        await detailPage.expectSequenceContentVisible();

        // FASTA download (server-side website route that queries LAPIS with the user's token).
        // `page.request` shares the browser context's session cookies; the cookie-less
        // `request` fixture would be redirected to the login page on gated routes.
        const fastaResponse = await page.request.get(`${baseURL}/seq/${accessionVersion}.fa`);
        expect(fastaResponse.ok()).toBe(true);
        expect(await fastaResponse.text()).toMatch(/^>/);

        // TSV metadata download (same route family as the FASTA download).
        const tsvResponse = await page.request.get(`${baseURL}/seq/${accessionVersion}.tsv`);
        expect(tsvResponse.ok()).toBe(true);
        expect((await tsvResponse.text()).split('\t').length).toBeGreaterThan(1);
    });
});
