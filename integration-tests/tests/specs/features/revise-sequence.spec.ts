import { test } from '../../fixtures/sequence.fixture';
import { expect } from '@playwright/test';
import { SearchPage } from '../../pages/search.page';
import { ReviewPage } from '../../pages/review.page';

test('revising sequence data works: segement can be deleted; segment can be edited', async ({
    pageWithReleasedSequence: page,
}) => {
    test.setTimeout(60000);
    const searchPage = new SearchPage(page);

    await searchPage.cchf();

    await page.getByRole('link', { name: 'Submit' }).click();
    await page.getByRole('link', { name: "View View your group's" }).click();

    const loculusId = await searchPage.waitForLoculusId();
    expect(loculusId).toBeTruthy();

    await searchPage.clickOnSequence(0);

    await page.getByRole('link', { name: 'Revise this sequence' }).click({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Create new revision from' })).toBeVisible();

    await page.getByTestId('discard_L_segment_file').click();
    await page.getByTestId('discard_S_segment_file').click();
    await page.getByTestId('S_segment_file').setInputFiles({
        name: 'update_S.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('AAAAA'),
    });

    await page.getByRole('button', { name: 'Submit' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();

    const reviewPage = new ReviewPage(page);

    await reviewPage.waitForZeroProcessing();

    await reviewPage.viewSequences();
    await expect(reviewPage.sequenceViewerContent()).not.toBeVisible(); // L was deleted

    const tabs = await reviewPage.getAvailableSequenceTabs();
    await reviewPage.switchSequenceTab(tabs[2]); // S tab

    expect(await reviewPage.getSequenceContent()).toBe('AAAAA');

    await reviewPage.closeSequencesDialog();
});
