import { routes } from '../../../src/routes/routes.ts';
import { baseUrl, dummyOrganism, test } from '../../e2e.fixture.ts';

test.describe('The submit page', () => {
    // NOTE: 'should upload files and submit' test removed - covered by integration-tests/tests/specs/features/submission-flow.spec.ts
    // NOTE: 'should upload compressed files and submit' test removed - covered by integration-tests/tests/specs/features/submission-compressed-files.spec.ts

    test('should set data use terms', async ({ submitPage, loginAsTestUser }) => {
        const { groupId } = await loginAsTestUser();
        await submitPage.goto(groupId);

        await Promise.all([submitPage.uploadSequenceData(), submitPage.uploadMetadata()]);
        await submitPage.selectRestrictedDataUseTerms();
        await submitPage.confirmationINSDCTerms.click();
        await submitPage.confirmationNoPII.click();
        await submitPage.submit();

        await submitPage.page.waitForURL(`${baseUrl}${routes.userSequenceReviewPage(dummyOrganism.key, groupId)}`);
    });
});
