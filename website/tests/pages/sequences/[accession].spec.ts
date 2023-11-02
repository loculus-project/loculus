import { expect, test, testSequence } from '../../e2e.fixture';

test.describe('The detailed sequence page', () => {
    test('can load and show sequences', async ({ sequencePage }) => {
        await sequencePage.goto();
        await expect(sequencePage.page.getByText(testSequence.orf1a)).not.toBeVisible();

        await sequencePage.loadSequences();
        await sequencePage.clickORF1aButton();

        await expect(sequencePage.page.getByText(testSequence.orf1a, { exact: false })).toBeVisible();
    });
});
