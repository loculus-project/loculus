import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../pages/search.page';

test.describe('Sequence FASTA endpoint', () => {
    test('returns valid FASTA with CORS headers', async ({ page, baseURL }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();
        const accessionVersion = await searchPage.waitForLoculusId();

        const response = await page.request.get(`${baseURL}/seq/${accessionVersion}.fa`);

        expect(response.ok()).toBe(true);
        expect(response.headers()['access-control-allow-origin']).toBe('*');

        const content = await response.text();
        expect(content).toMatch(/^>/);
        expect(content).toContain(accessionVersion);
        expect(content.split('\n').length).toBeGreaterThan(1);
    });

    test('downloads FASTA with correct headers when download=true', async ({ page, baseURL }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();
        const accessionVersion = await searchPage.waitForLoculusId();

        const response = await page.request.get(
            `${baseURL}/seq/${accessionVersion}.fa?download=true`,
        );

        expect(response.ok()).toBe(true);
        expect(response.headers()['access-control-allow-origin']).toBe('*');

        const contentDisposition = response.headers()['content-disposition'];
        expect(contentDisposition).toContain('attachment');
        expect(contentDisposition).toContain(accessionVersion);
    });
});
