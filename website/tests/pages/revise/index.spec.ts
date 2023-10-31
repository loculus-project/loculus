import { expect, test } from '../../e2e.fixture';
import { prepareDataToBe } from '../../util/prepareDataToBe.ts';

test.describe('The revise page', () => {
    test('should upload files and revise existing data', async ({ revisePage, loginAsTestUser }) => {
        const sequenceEntries = await prepareDataToBe('approvedForRelease');

        await loginAsTestUser();

        await revisePage.goto();
        await expect(revisePage.page.getByText('Result of Revision')).not.toBeVisible();
        await revisePage.submitRevisedData(sequenceEntries.map((entry) => entry.accession));
        await expect(revisePage.page.getByText('Result of Revision')).toBeVisible();
    });
});
