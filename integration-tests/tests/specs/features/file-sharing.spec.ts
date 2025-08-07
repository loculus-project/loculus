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

    const largeContent1 = 'Hello world! This is test data. '.repeat(260000);
    const largeContent2 = 'Multipart upload test content. '.repeat(370000);

    let cleanup: () => Promise<void>;
    try {
        cleanup = await submissionPage.uploadExternalFiles('raw_reads', {
            'large_file1.txt': largeContent1,
            'large_file2.txt': largeContent2,
        });

        await expect(page.getByText(/Overall progress/)).toBeVisible({ timeout: 10000 });
        await expect(page.getByText(/MB/)).toBeVisible();

        await expect(page.getByText('✓').first()).toBeVisible({ timeout: 60000 });
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
    await expect(filesDialog.getByText('large_file1.txt')).toBeVisible();
    await checkFileContent(page, 'large_file1.txt', largeContent1);
    await expect(filesDialog.getByText('large_file2.txt')).toBeVisible();
    await checkFileContent(page, 'large_file2.txt', largeContent2);
    await reviewPage.closeFilesDialog();

    await reviewPage.releaseValidSequences();

    await page.getByRole('link', { name: 'released sequences' }).click();
    while (!(await page.getByRole('link', { name: /LOC_/ }).isVisible())) {
        await page.reload();
        await page.waitForTimeout(2000);
    }

    await page.getByLabel('SearchResult').click();
    await checkFileContent(page, 'large_file1.txt', largeContent1);
    await checkFileContent(page, 'large_file2.txt', largeContent2);
});

test('submit two sequences with one file each', async ({ pageWithGroup, page }) => {
    test.setTimeout(180000); // Increased timeout for large file uploads
    const submissionPage = new BulkSubmissionPage(pageWithGroup);

    await submissionPage.navigateToSubmissionPage('Test organism (with files)');

    await submissionPage.uploadMetadataFile(
        ['submissionId', 'country', 'date'],
        [
            ['sub1', 'Sweden', '2022-12-02'],
            ['sub2', 'Uganda', '2022-12-13'],
        ],
    );

    await page.getByRole('heading', { name: 'Extra files' }).scrollIntoViewIfNeeded();

    // Generate large files for each submission
    const largeContent1 = 'Sweden submission data. '.repeat(220000); // ~5.3MB
    const largeContent2 = 'Uganda submission data. '.repeat(230000); // ~5.5MB

    let cleanup: () => Promise<void>;
    try {
        cleanup = await submissionPage.uploadExternalFiles('raw_reads', {
            sub1: {
                'sweden_data.txt': largeContent1,
            },
            sub2: {
                'uganda_data.txt': largeContent2,
            },
        });

        // Watch for progress indicators during upload
        await expect(page.getByText(/Overall progress/)).toBeVisible({ timeout: 10000 });
        await expect(page.getByText(/MB/)).toBeVisible(); // Should show MB units for large files

        await expect(page.getByText('✓').first()).toBeVisible({ timeout: 60000 });
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
    await checkFileContent(page, 'sweden_data.txt', largeContent1);

    await page.getByTestId('close-preview-button').click();

    await page.getByRole('cell', { name: 'Uganda' }).click();
    await checkFileContent(page, 'uganda_data.txt', largeContent2);
});

async function checkFileContent(page: Page, fileName: string, fileContent: string) {
    await expect(page.getByRole('heading', { name: 'Files' })).toBeVisible();
    // check response instead of page content, because the file might also trigger a download in some cases.
    const fileUrl = await page.getByRole('link', { name: fileName }).getAttribute('href');
    await Promise.all([
        page.waitForResponse(
            async (resp) => resp.status() === 200 && (await resp.text()) === fileContent,
        ),
        page.evaluate((url) => fetch(url), fileUrl),
    ]);
}
