import { test, expect } from '@playwright/test';

test('has strain field', async ({ page }) => {
    await page.goto('http://localhost:3001/sequences/OU189322');

    const content = await page.textContent('body');
    await expect(content?.includes('strain')).toBeTruthy();
});

test('can load and show sequences', async ({ page }) => {
    await page.goto('http://localhost:3001/sequences/OU189322');

    // Check that there is a button with the label "Load sequences"
    const loadSequencesButton = await page.$('text=Load sequences');
    expect(loadSequencesButton).toBeTruthy();

    // Check that there is a button with the label "ORF1a"
    const orf1aButton = await page.$('text=ORF1a');
    expect(orf1aButton).toBeTruthy();

    // Check that the page does not contain the nucleotide sequence
    let content = await page.textContent('body');
    await expect(content?.includes('ACCAACCAAC')).toBeFalsy();

    // Click on the button "Load sequences" and wait a bit
    await page.getByRole('button', { name: 'Load sequences' }).click();
    await page.waitForSelector('pre > code', { timeout: 3000 });

    // Check that the page now shows the nucleotide sequence
    content = await page.textContent('body');
    await expect(content?.includes('ACCAACCAAC')).toBeTruthy();

    // Click on the button "ORF1a" and wait a bit
    await page.getByRole('button', { name: 'ORF1a' }).click();
    await page.waitForSelector('pre > code', { timeout: 3000 });

    // Check that the page now shows the amino acid sequence
    content = await page.textContent('body');
    await expect(content?.includes('MESLVPGFNE')).toBeTruthy();
});
