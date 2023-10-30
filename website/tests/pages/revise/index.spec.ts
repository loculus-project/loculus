import { expect, test } from '../../e2e.fixture';
import { prepareDataToBe } from '../../util/prepareDataToBe.ts';

test.describe('The revise page', () => {
    test('should upload files and revise existing data', async ({ revisePage }) => {
        const sequences = await prepareDataToBe('releasable');

        await revisePage.goto();
        await expect(revisePage.page.getByText('Result of Revision')).not.toBeVisible();
        await revisePage.submitRevisedData(sequences.map((entry) => entry.sequenceId));
        await expect(revisePage.page.getByText('Result of Revision')).toBeVisible();
    });
});
