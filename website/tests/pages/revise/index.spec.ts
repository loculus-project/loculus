import { routes } from '../../../src/routes.ts';
import { baseUrl, dummyOrganism, test, testSequenceCount } from '../../e2e.fixture';
import { prepareDataToBe } from '../../util/prepareDataToBe.ts';

test.describe('The revise page', () => {
    test('should upload files and revise existing data', async ({ revisePage, loginAsTestUser }) => {
        const { token, groupName } = await loginAsTestUser();

        const sequenceEntries = await prepareDataToBe('approvedForRelease', token, testSequenceCount, groupName);

        await revisePage.goto();

        await revisePage.submitRevisedData(sequenceEntries.map((entry) => entry.accession));

        await revisePage.page.waitForURL(`${baseUrl}${routes.userSequenceReviewPage(dummyOrganism.key)}`);
    });
});
