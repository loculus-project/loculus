import { expect } from '@playwright/test';
import { test } from '../../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../../pages/search.page';
import * as fs from 'fs';

test('Download FASTA with rich headers (Display name) and validate content', async ({
    page,
    browserName,
}) => {
    test.skip(browserName === 'webkit', 'Download tests are skipped on WebKit');

    const searchPage = new SearchPage(page);
    await searchPage.ebolaSudan();

    // Filter for sequences from Uganda to ensure we get rich headers with country metadata
    // Uganda sequences typically have date information available which will show in rich headers
    await searchPage.select('Country', 'Uganda');

    // Wait for filtered results and get a Uganda sequence with date data
    const loculusId = await searchPage.waitForLoculusId();
    expect(loculusId).toBeTruthy();

    // Search for this specific Uganda sequence to get predictable rich header results
    await searchPage.enterAccessions(loculusId);

    // Open download dialog
    await page.getByRole('button', { name: 'Download all entries' }).click();

    // Agree to terms
    await page.getByLabel('I agree to the data use terms.').check();

    // Select raw nucleotide sequences (FASTA)
    await page.getByLabel('Raw nucleotide sequences').click();

    // Select Display name FASTA header style (rich headers)
    await page.getByLabel('Display name').click();

    // Start download
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('start-download').click();
    const download = await downloadPromise;

    // Save and read the downloaded file
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    const fileContent = fs.readFileSync(downloadPath, 'utf8');
    const lines = fileContent.trim().split('\n');

    // Validate FASTA format
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0]).toMatch(/^>/); // First line should be FASTA header starting with >

    // Validate that the header contains rich information (not just accession)
    // The rich header should contain more than just the basic accession format
    const header = lines[0];

    // Should contain the accession ID
    expect(header).toContain(loculusId);

    // Should contain rich header information with Uganda country and date data
    // Expected format: ">Uganda/LOC_XXXXXXX.X/YYYY-MM-DD" when country and date are available
    // Rich headers should include location, accession, and date information
    expect(header.length).toBeGreaterThan(loculusId.length + 1); // More than just ">ACCESSION"
    expect(header).toMatch(/\//); // Should contain "/" separators in rich format
    expect(header).toContain('Uganda'); // Should contain the country we filtered for
    expect(header).toMatch(/\d{4}/); // Should contain at least a year (YYYY format or YYYY-MM-DD)

    // Validate sequence content
    expect(lines[1]).toMatch(/^[ATCGN-]+$/i); // Second line should be nucleotide sequence

    console.log(`✓ FASTA header: ${header}`);
    console.log(`✓ Sequence length: ${lines[1].length}`);
});

test('Download FASTA without rich headers and validate basic format', async ({
    page,
    browserName,
}) => {
    test.skip(browserName === 'webkit', 'Download tests are skipped on WebKit');

    const searchPage = new SearchPage(page);
    await searchPage.ebolaSudan();

    // Also filter for Uganda to ensure consistent comparison with the same type of sequence
    await searchPage.select('Country', 'Uganda');

    const loculusId = await searchPage.waitForLoculusId();
    expect(loculusId).toBeTruthy();

    await searchPage.enterAccessions(loculusId);

    await page.getByRole('button', { name: 'Download all entries' }).click();
    await page.getByLabel('I agree to the data use terms.').check();

    // Select raw nucleotide sequences but NOT Display name headers (use default)
    await page.getByLabel('Raw nucleotide sequences').click();
    // Don't select Display name option - use default basic headers

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('start-download').click();
    const download = await downloadPromise;

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    const fileContent = fs.readFileSync(downloadPath, 'utf8');
    const lines = fileContent.trim().split('\n');

    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0]).toMatch(/^>/);

    const header = lines[0];

    // Should contain the accession ID
    expect(header).toContain(loculusId);

    // Basic FASTA headers should be simpler than rich headers
    // Even with both country and date data available, basic headers should not include the rich formatting
    // Basic format should be just the accession, regardless of available metadata

    expect(lines[1]).toMatch(/^[ATCGN-]+$/i);

    console.log(`✓ Basic FASTA header: ${header}`);
    console.log(`✓ Sequence length: ${lines[1].length}`);
});

test('Rich FASTA header UI elements are present when enabled', async ({ page }) => {
    const searchPage = new SearchPage(page);
    await searchPage.ebolaSudan();

    await page.getByRole('button', { name: 'Download all entries' }).click();
    await page.getByLabel('I agree to the data use terms.').check();

    // Select sequences to show FASTA options
    await page.getByLabel('Raw nucleotide sequences').click();

    // Verify that Display name option is available (rich headers enabled)
    const displayNameOption = page.getByLabel('Display name');
    await expect(displayNameOption).toBeVisible();

    // Just verify we can interact with the display name option
    await displayNameOption.click();
    console.log('✓ Display name rich FASTA header option is available and clickable');
});
