import { expect, test, testSequence } from '../../e2e.fixture';

test.describe('The detailed sequence page', () => {
    test('has "Strain" field', async ({ sequencePage }) => {
        await sequencePage.goto();
        await expect(sequencePage.page.getByText('Strain:', { exact: true })).toBeVisible();
    });

    test('can load and show sequences', async ({ sequencePage }) => {
        await sequencePage.goto();
        await expect(sequencePage.page.getByText(testSequence.orf1a)).not.toBeVisible();

        await sequencePage.clickORF1aButton();
        await sequencePage.loadSequences();

        await expect(sequencePage.page.getByText(testSequence.orf1a)).toBeVisible();
    });
});
