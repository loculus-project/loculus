import { Page, expect } from '@playwright/test';
import { test } from '../../fixtures/tempdir.fixture';
import { BulkSubmissionPage, SingleSequenceSubmissionPage } from '../../pages/submission.page';
import { getFromLinkTargetAndAssertContent } from '../../utils/link-helpers';

test('submit a single sequence with two files', async ({ pageWithGroup, page, tempDir }) => {
    test.setTimeout(180_000);
    const submissionPage = new SingleSequenceSubmissionPage(pageWithGroup);

    await submissionPage.navigateToSubmissionPage('Test organism (with files)');
    await submissionPage.fillSubmissionFormDummyOrganism({
        submissionId: 'TEST-ID-123',
        country: 'Uganda',
        date: '2023-10-15',
    });

    await submissionPage.uploadExternalFiles(
        'raw_reads',
        {
            'hello.txt': 'Hello',
            'world.txt': 'World',
        },
        tempDir,
    );

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

test('submit two sequences with one file each', async ({ pageWithGroup, page, tempDir }) => {
    test.setTimeout(180_000);
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

    await submissionPage.uploadExternalFiles(
        'raw_reads',
        {
            sub1: {
                'foo.txt': 'Foo',
                'baz.txt': 'Baz',
            },
            sub2: {
                'bar.txt': 'Bar',
            },
        },
        tempDir,
    );

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
    await checkFileContent(page, 'baz.txt', 'Baz');

    await page.getByTestId('close-preview-button').click();

    await page.getByRole('cell', { name: 'Uganda' }).click();
    await checkFileContent(page, 'bar.txt', 'Bar');
});

test('discard and re-upload files', async ({ pageWithGroup, page, tempDir }) => {
    test.setTimeout(180_000);
    const submissionPage = new BulkSubmissionPage(pageWithGroup);

    await submissionPage.navigateToSubmissionPage('Test organism (with files)');

    await submissionPage.uploadMetadataFile(
        ['submissionId', 'country', 'date'],
        [['sub1', 'Norway', '2023-01-01']],
    );

    await page.getByRole('heading', { name: 'Extra files' }).scrollIntoViewIfNeeded();

    // First upload: 1 submission with 1 file
    await submissionPage.uploadExternalFiles(
        'raw_reads',
        {
            sub1: {
                'old.txt': 'This should be discarded',
            },
        },
        tempDir,
    );

    // Discard the files
    await page.getByTestId('discard_raw_reads').click();

    // Second upload: 1 submission with 2 files
    await submissionPage.uploadExternalFiles(
        'raw_reads',
        {
            sub1: {
                'new1.txt': 'New file 1',
                'new2.txt': 'New file 2',
            },
        },
        tempDir,
    );

    await submissionPage.acceptTerms();
    const reviewPage = await submissionPage.submitSequence();
    await reviewPage.waitForZeroProcessing();

    // Check that only the new files exist, not the old one
    const filesDialog = await reviewPage.viewFiles();
    await expect(filesDialog.getByText('new1.txt')).toBeVisible();
    await expect(filesDialog.getByText('new2.txt')).toBeVisible();
    await expect(filesDialog.getByText('old.txt')).not.toBeVisible();
    await reviewPage.closeFilesDialog();

    await reviewPage.releaseValidSequences();

    await page.getByRole('link', { name: 'released sequences' }).click();
    while (!(await page.getByRole('cell', { name: 'Norway' }).isVisible())) {
        await page.reload();
        await page.waitForTimeout(2000);
    }

    await page.getByRole('cell', { name: 'Norway' }).click();
    await checkFileContent(page, 'new1.txt', 'New file 1');
    await checkFileContent(page, 'new2.txt', 'New file 2');
    // Verify old file is not present
    await expect(page.getByRole('link', { name: 'old.txt' })).not.toBeVisible();
});

async function checkFileContent(page: Page, fileName: string, fileContent: string) {
    await expect(page.getByRole('heading', { name: 'Files' })).toBeVisible();
    await getFromLinkTargetAndAssertContent(
        page.getByRole('link', { name: fileName }),
        fileContent,
    );
}
