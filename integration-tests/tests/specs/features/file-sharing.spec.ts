import { Page, expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { BulkSubmissionPage, SingleSequenceSubmissionPage } from '../../pages/submission.page';

test('submit a single sequence with two files', async ({ pageWithGroup, page }) => {
    test.setTimeout(90000);
    const submissionPage = new SingleSequenceSubmissionPage(pageWithGroup);

    await submissionPage.navigateToSubmissionPage('Test organism (with files)');
    await submissionPage.fillSubmissionFormDummyOrganism({
        submissionId: 'TEST-ID-123',
        country: 'Uganda',
        date: '2023-10-15',
    });
    let cleanup: () => Promise<void>;
    try {
        cleanup = await submissionPage.uploadExternalFiles('raw_reads', {
            'hello.txt': 'Hello',
            'world.txt': 'World',
        });

        await expect(page.getByText('✓').first()).toBeVisible();
        await expect(page.getByText('✓').nth(1)).toBeVisible();
    } finally {
        if (cleanup) {
            await cleanup();
        }
    }

    await submissionPage.acceptTerms();
    const reviewPage = await submissionPage.submitSequence();
    await reviewPage.waitForZeroProcessing();

    // check that files can be seen after processing
    const filesDialog = await reviewPage.viewFiles();
    await expect(filesDialog.getByText('hello.txt')).toBeVisible();
    await checkFileContent(page, 'hello.txt', 'Hello');
    await expect(filesDialog.getByText('world.txt')).toBeVisible();
    await checkFileContent(page, 'world.txt', 'World');
    await reviewPage.closeFilesDialog();

    await reviewPage.releaseValidSequences();

    await page.getByRole('link', { name: 'released sequences' }).click();
    while (!(await page.getByRole('link', { name: /LOC_/ }).isVisible())) {
        await page.reload();
        await page.waitForTimeout(2000);
    }

    await page.getByLabel('SearchResult').click();
    await checkFileContent(page, 'hello.txt', 'Hello');
    await checkFileContent(page, 'world.txt', 'World');
});

test('submit two sequences with one file each', async ({ pageWithGroup, page }) => {
    test.setTimeout(90000);
    const submissionPage = new BulkSubmissionPage(pageWithGroup);

    await submissionPage.navigateToSubmissionPage('Test organism (with files)');

    await submissionPage.uploadMetadataFile(
        ['submissionId', 'country', 'date'],
        [
            ['sub1', 'Sweden', '2022-12-02'],
            ['sub2', 'Uganda', '2022-12-13'],
        ],
    );

    let cleanup: () => Promise<void>;
    try {
        cleanup = await submissionPage.uploadExternalFiles('raw_reads', {
            sub1: {
                'foo.txt': 'Foo',
            },
            sub2: {
                'bar.txt': 'Bar',
            },
        });

        await expect(page.getByText('✓').first()).toBeVisible();
        await expect(page.getByText('✓').nth(1)).toBeVisible();
    } finally {
        if (cleanup) {
            await cleanup();
        }
    }

    await submissionPage.acceptTerms();
    const reviewPage = await submissionPage.submitSequence();
    await reviewPage.waitForZeroProcessing();

    await reviewPage.releaseValidSequences();

    await page.getByRole('link', { name: 'released sequences' }).click();
    while (!(await page.getByRole('cell', { name: 'Sweden' }).isVisible())) {
        await page.reload();
        await page.waitForTimeout(2000);
    }

    await page.getByRole('cell', { name: 'Sweden' }).click();
    await checkFileContent(page, 'foo.txt', 'Foo');

    await page.getByTestId('close-preview-button').click();

    await page.getByRole('cell', { name: 'Uganda' }).click();
    await checkFileContent(page, 'bar.txt', 'Bar');
});

export async function checkFileContent(
    page: Page,
    fileName: string,
    expectedContent: string,
  ) {
    // 1. Make sure we are on the Files view.
    await expect(
      page.getByRole('heading', { name: 'Files' }),
    ).toBeVisible();
  
    // 2. Resolve the download URL from the link element.
    const link = page.getByRole('link', { name: fileName });
    const fileUrl = await link.getAttribute('href');
    if (!fileUrl) {
      throw new Error(`Link “${fileName}” has no href attribute`);
    }
  
    // 3. Start the request inside the browser, then watch for its response.
    const [response] = await Promise.all([
      // Wait only for the response we care about. No body calls here.
      page.waitForResponse((r) => r.url() === fileUrl && r.status() === 200),
      // In-page fetch makes the request appear in the network recorder.
      page.evaluate((url) => fetch(url, { cache: 'no-store' }), fileUrl),
    ]);
  
    // 4. Now it is 100 % safe to read the body.
    const body = await response.text();
    expect(body).toBe(expectedContent);
  }
