import { routes } from '../../../src/routes/routes.ts';
import { baseUrl, dummyOrganism, test } from '../../e2e.fixture';
import { prepareDataToBe } from '../../util/prepareDataToBe.ts';

test.describe('The revise page', () => {
    test('should upload files and revise existing data', async ({ revisePage, loginAsTestUser }) => {
        const { token, groupId } = await loginAsTestUser();

        const sequenceEntries = await prepareDataToBe('approvedForRelease', token, groupId);

        await revisePage.goto(groupId);

        await revisePage.submitRevisedData(sequenceEntries.map((entry) => entry.accession));

        await revisePage.page.waitForURL(`${baseUrl}${routes.userSequenceReviewPage(dummyOrganism.key, groupId)}`);
    });
});
