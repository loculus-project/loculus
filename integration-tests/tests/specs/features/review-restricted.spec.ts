import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { ReviewPage } from '../../pages/review.page';
import { SingleSequenceSubmissionPage } from '../../pages/submission.page';
import { createTestMetadata, createTestSequenceData } from '../../test-helpers/test-data';

test.describe('Review page restricted sequences', () => {
    test('approve restricted sequences', async ({ page, groupId }) => {
        test.setTimeout(120_000);
        const submissionPage = new SingleSequenceSubmissionPage(page);
        const reviewPage = new ReviewPage(page);

        await submissionPage.completeSubmission(
            {
                ...createTestMetadata(),
                isRestricted: true,
            },
            createTestSequenceData(),
        );

        await reviewPage.goto(groupId);
        await reviewPage.waitForTotalSequenceCountCorrect(1);
        await reviewPage.approveAll();
        await reviewPage.waitForTotalSequenceCountCorrect(0);

        await page.goto(`/ebola-sudan/submission/${groupId}/released?dataUseTerms=RESTRICTED`);

        await expect
            .poll(
                async () => {
                    await page.reload();
                    return page.getByText('Search returned 1 sequence').isVisible();
                },
                {
                    message: 'Expected 1 restricted sequence to appear',
                    timeout: 60_000,
                },
            )
            .toBe(true);

        const rowLocator = page.locator('a[href*="/seq/LOC"]').first();
        await expect(rowLocator).toBeVisible();
        await rowLocator.click();

        await expect(page.getByText('Restricted-Use sequence')).toBeVisible();
    });
});
