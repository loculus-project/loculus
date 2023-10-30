import { expect, test, testuser } from '../../e2e.fixture';

test.describe('The submit page', () => {
    test('should upload files and submit', async ({ submitPage }) => {
        await submitPage.goto();

        await Promise.all([
            submitPage.uploadSequenceData(),
            submitPage.setUsername(testuser),
            submitPage.uploadMetadata(),
        ]);

        await expect(submitPage.page.getByText('Response Sequence Headers')).not.toBeVisible();
        await submitPage.submitButton.click();
        await expect(submitPage.page.getByText('Response Sequence Headers')).toBeVisible();
    });
});
