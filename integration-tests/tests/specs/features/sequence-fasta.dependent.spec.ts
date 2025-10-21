import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';

test.describe('Sequence FASTA endpoint', () => {
    test('can load and show fasta file with CORS headers', async ({ page }) => {
        // First navigate to search to find a sequence
        await page.goto('/');
        await page.getByRole('link', { name: 'Ebola Sudan' }).click();

        // Wait for sequences to load and get the first accession
        const sequenceRow = page.locator('[data-testid="sequence-row"]').first();
        await expect(sequenceRow).toBeVisible({ timeout: 10000 });
        const rowText = await sequenceRow.innerText();
        const accessionMatch = rowText.match(/LOC_[A-Z0-9]+\.[0-9]+/);

        expect(accessionMatch).toBeTruthy();
        const accessionVersion = accessionMatch[0];

        // Construct the FASTA URL
        const baseUrl = page.url().split('/ebola-sudan')[0];
        const fastaUrl = `${baseUrl}/ebola-sudan/seq/${accessionVersion}.fa`;

        // Fetch the FASTA file
        const response = await fetch(fastaUrl);

        // Verify CORS headers
        const corsHeader = response.headers.get('Access-Control-Allow-Origin');
        expect(corsHeader).toBe('*');

        // Verify content
        const content = await response.text();
        expect(content).toContain(`>${accessionVersion}`);
        expect(content.split('\n').length).toBeGreaterThan(1);
    });

    test('can download fasta file with correct headers', async ({ page }) => {
        // First navigate to search to find a sequence
        await page.goto('/');
        await page.getByRole('link', { name: 'Ebola Sudan' }).click();

        // Wait for sequences to load and get the first accession
        const sequenceRow = page.locator('[data-testid="sequence-row"]').first();
        await expect(sequenceRow).toBeVisible({ timeout: 10000 });
        const rowText = await sequenceRow.innerText();
        const accessionMatch = rowText.match(/LOC_[A-Z0-9]+\.[0-9]+/);

        expect(accessionMatch).toBeTruthy();
        const accessionVersion = accessionMatch[0];

        // Construct the FASTA download URL
        const baseUrl = page.url().split('/ebola-sudan')[0];
        const downloadUrl = `${baseUrl}/ebola-sudan/seq/${accessionVersion}.fa?download=true`;

        // Fetch the FASTA file with download parameter
        const response = await fetch(downloadUrl);

        // Verify CORS headers
        const corsHeader = response.headers.get('Access-Control-Allow-Origin');
        expect(corsHeader).toBe('*');

        // Verify Content-Disposition header
        const contentDisposition = response.headers.get('Content-Disposition');
        expect(contentDisposition).not.toBeNull();
        expect(contentDisposition).toContain('attachment');
        expect(contentDisposition).toContain(accessionVersion);
    });
});
