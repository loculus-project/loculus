import { expect, test, testuser } from '../../e2e.fixture';

test.describe('The submit page', () => {
    test('should upload files and submit', async ({ submitPage, userPage }) => {
        await submitPage.goto();
        await submitPage.uploadMetadata();
        await submitPage.uploadSequenceData();
        await submitPage.setUsername(testuser);

        await expect(submitPage.page.getByText('Response Sequence Headers')).not.toBeVisible();
        await submitPage.submitButton.click();
        await expect(submitPage.page.getByText('Response Sequence Headers')).toBeVisible();

        await userPage.gotoUserSequencePage();
        const resultCount = await userPage.page.getByText('RECEIVED').count();
        expect(resultCount).toBeGreaterThanOrEqual(submitPage.getTestSequenceCount());
    });
});
