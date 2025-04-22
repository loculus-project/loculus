import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { ReviewPage } from '../../pages/review.page';
import { SingleSequenceSubmissionPage } from '../../pages/singlesubmission.page';

test.only('submit a single sequence', async ({ pageWithGroup, page }) => {
    test.setTimeout(90000);
    const submissionPage = new SingleSequenceSubmissionPage(pageWithGroup);

    await submissionPage.navigateToSubmissionPage("Test organism (with files)");
    await submissionPage.fillSubmissionFormDummyOrganism({
        submissionId: 'TEST-ID-123',
        country: 'Uganda',
        date: '2023-10-15',
    });
    await submissionPage.uploadExternalFiles();
    await submissionPage.acceptTerms();
    await submissionPage.submitSequence();
    await page.waitForURL('**\/review');

    const reviewPage = new ReviewPage(page);
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
    await expect(page.getByRole('link', { name: 'world.txt' })).toBeVisible();
});
