import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../pages/search.page';

async function getReleasedSequenceId(searchPage: SearchPage): Promise<string> {
    await searchPage.ebolaSudan();
    const loculusId = await searchPage.waitForLoculusId();
    expect(loculusId).toBeTruthy();
    if (!loculusId) {
        throw new Error('Failed to find a released sequence identifier.');
    }
    return loculusId;
}

test.describe('Sequence FASTA endpoint', () => {
    test('returns FASTA content with permissive CORS headers', async ({ page, request }) => {
        const searchPage = new SearchPage(page);
        const accessionVersion = await getReleasedSequenceId(searchPage);

        const response = await request.get(`/seq/${accessionVersion}.fasta`);
        expect(response.ok()).toBeTruthy();

        const headers = response.headers();
        expect(headers['access-control-allow-origin']).toBe('*');

        const fastaContent = await response.text();
        expect(fastaContent.startsWith(`>${accessionVersion}\n`)).toBeTruthy();
        expect(fastaContent.trimEnd()).not.toEqual(`>${accessionVersion}`);
    });

    test('download parameter sets attachment headers for FASTA', async ({ page, request }) => {
        const searchPage = new SearchPage(page);
        const accessionVersion = await getReleasedSequenceId(searchPage);

        const response = await request.get(`/seq/${accessionVersion}.fasta?download`);
        expect(response.ok()).toBeTruthy();

        const headers = response.headers();
        expect(headers['access-control-allow-origin']).toBe('*');

        const contentDisposition = headers['content-disposition'];
        expect(contentDisposition).toBeTruthy();
        expect(contentDisposition).toContain('attachment');
        expect(contentDisposition).toContain(accessionVersion);
    });
});
