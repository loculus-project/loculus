import { expect, request as playwrightRequest } from '@playwright/test';

import { test } from '../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../pages/search.page';
import { SequenceDetailPage } from '../../pages/sequence-detail.page';
import {
    getTestUserTokens,
    loginTestUserWithCookies,
    skipUnlessAuthenticationForDataIsRequired,
} from '../../utils/dataAuthentication';

/**
 * The website with `auth.requireAuthenticationForData`. Depends on the released sequences of `readonly.setup.ts`.
 */
test.describe('Website with authentication required for data', () => {
    test.beforeEach(async ({ page }) => {
        await skipUnlessAuthenticationForDataIsRequired(test, page.request);
    });

    test('anonymous visitors see the homepage without counts and must log in for data pages', async ({
        page,
    }) => {
        await page.goto('/');
        const ebolaSudanCard = page.getByRole('link', { name: /Ebola Sudan/ }).first();
        await expect(ebolaSudanCard).toBeVisible();
        await expect(ebolaSudanCard.locator('span.font-bold')).toHaveCount(0);

        await page.goto('/ebola-sudan/search');
        await expect(page).toHaveURL(/\/realms\/loculus\//);
    });

    test('logged-in users see counts, search results and no link-outs', async ({ page }) => {
        await loginTestUserWithCookies(page);

        await page.goto('/');
        const ebolaSudanCard = page.getByRole('link', { name: /Ebola Sudan/ }).first();
        await expect(ebolaSudanCard.locator('span.font-bold')).toHaveText(/^\d[\d,]*$/);

        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();
        await searchPage.waitForSequencesInSearch(1);
        // External tools cannot authenticate against LAPIS
        await expect(page.getByRole('button', { name: 'Tools' })).toBeHidden();
    });

    test('logged-in users can open sequences and download them', async ({ page, baseURL }) => {
        await loginTestUserWithCookies(page);
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();
        const [{ accessionVersion }] = await searchPage.waitForSequencesInSearch(1);

        const detailPage = new SequenceDetailPage(page);
        await detailPage.goto(accessionVersion);
        await detailPage.waitForSequenceTabs();
        await detailPage.selectUnalignedTab();
        await detailPage.expectSequenceContentVisible();

        // page.request shares the session cookies of the browser
        const fasta = await page.request.get(`${baseURL}/seq/${accessionVersion}.fa`);
        expect(fasta.ok()).toBe(true);
        expect(await fasta.text()).toMatch(/^>/);

        const tsv = await page.request.get(`${baseURL}/seq/${accessionVersion}.tsv`);
        expect(tsv.ok()).toBe(true);
    });

    test('search page downloads go through the website', async ({ page }) => {
        await loginTestUserWithCookies(page);
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        await page.getByRole('button', { name: 'Download all entries' }).click();
        await page.getByLabel('I agree to the data use terms.').check();

        const requestPromise = page.waitForRequest((request) =>
            request.url().includes('/sample/details'),
        );
        const downloadPromise = page.waitForEvent('download');
        await page.getByTestId('start-download').click();

        const request = await requestPromise;
        const download = await downloadPromise;
        expect(new URL(request.url()).pathname).toBe('/ebola-sudan/lapis-download/sample/details');
        expect(await download.failure()).toBeNull();
    });

    test('API clients can fetch download links and file links with a Bearer token', async ({
        page,
        baseURL,
    }) => {
        await loginTestUserWithCookies(page);
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();
        // The sequence with an annotations file from the readonly setup, see annotations.dependent.spec.ts
        await searchPage.enableSearchFields('Author affiliations', 'Submission ID');
        await searchPage.fill('Submission ID', 'foobar');
        await searchPage.fill('Author affiliations', 'Patho Institute, Paris');
        const { accessionVersion } = await searchPage.getUniqueAccessionVersion();
        await searchPage.clickOnSequence();
        const fileLink = page.getByRole('link', { name: `${accessionVersion}.embl` });
        const fileUrl = new URL((await fileLink.getAttribute('href'))!, baseURL);

        const tokens = await getTestUserTokens(page.request);
        const apiClient = await playwrightRequest.newContext({ baseURL });
        const urls = [
            fileUrl.pathname,
            `/ebola-sudan/lapis-download/sample/details?accessionVersion=${accessionVersion}&dataFormat=tsv`,
        ];
        try {
            for (const url of urls) {
                const withoutToken = await apiClient.get(url, { maxRedirects: 0 });
                expect(withoutToken.status(), url).toBe(401);

                const withToken = await apiClient.get(url, {
                    headers: { Authorization: `Bearer ${tokens!.accessToken}` },
                });
                expect(withToken.status(), url).toBe(200);
            }
        } finally {
            await apiClient.dispose();
        }
    });
});
