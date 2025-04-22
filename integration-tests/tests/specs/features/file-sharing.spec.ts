import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { BulkSubmissionPage, SingleSequenceSubmissionPage } from '../../pages/submission.page';

test('submit a single sequence', async ({ pageWithGroup, page }) => {
    test.setTimeout(90000);
    const submissionPage = new SingleSequenceSubmissionPage(pageWithGroup);

    await submissionPage.navigateToSubmissionPage('Test organism (with files)');
    await submissionPage.fillSubmissionFormDummyOrganism({
        submissionId: 'TEST-ID-123',
        country: 'Uganda',
        date: '2023-10-15',
    });
    await submissionPage.uploadExternalFiles('raw_reads', {
        'hello.txt': 'Hello',
        'world.txt': 'World',
    });
    await submissionPage.acceptTerms();
    const reviewPage = await submissionPage.submitSequence();
    await reviewPage.waitForZeroProcessing();

    await reviewPage.releaseValidSequences();

    await page.getByRole('link', { name: 'released sequences' }).click();
    while (!(await page.getByRole('link', { name: /LOC_/ }).isVisible())) {
        await page.reload();
        await page.waitForTimeout(2000);
    }

    await page.getByLabel('SearchResult').click();
    await expect(page.getByRole('heading', { name: 'Files' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'hello.txt' })).toBeVisible();
    await page.getByRole('link', { name: 'hello.txt' }).click();
    expect(page.content()).toBe('Hello');
    await page.goBack();
    await page.getByRole('link', { name: 'world.txt' }).click();
    expect(page.content()).toBe('World');
});

test('foo', async ({ pageWithGroup, page }) => {
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

    await submissionPage.uploadExternalFiles('raw_reads', {
        sub1: {
            'foo.txt': 'Foo',
        },
        sub2: {
            'bar.txt': 'Bar',
        },
    });

    await expect(page.getByText('✓').first()).toBeVisible();
    await expect(page.getByText('✓').nth(1)).toBeVisible();

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
    await expect(page.getByRole('heading', { name: 'Files' })).toBeVisible();
    await page.getByRole('link', { name: 'foo.txt' }).click();
    expect(page.content()).toBe('Foo');
    await page.goBack();
    await page.getByTestId('close-preview-button').click();

    await page.getByRole('cell', { name: 'Uganda' }).click();
    await expect(page.getByRole('heading', { name: 'Files' })).toBeVisible();
    await page.getByRole('link', { name: 'bar.txt' }).click();
    expect(page.content()).toBe('Bar');
    await page.goBack();
});
