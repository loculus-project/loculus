import { routes } from '../../../src/routes/routes.ts';
import { baseUrl, dummyOrganism, expect, test } from '../../e2e.fixture.ts';

test.describe('The submit page', () => {
    test('should ask to login if not logged in', async ({ submitPage }) => {
        const submittingGroupNumber = 1;
        await submitPage.goto(submittingGroupNumber);

        await submitPage.loginButton.click();

        expect(submitPage.page.url()).toContain('realms/loculus');
    });

    test('should upload files and submit', async ({ submitPage, loginAsTestUser }) => {
        const { groupId } = await loginAsTestUser();
        await submitPage.goto(groupId);

        await Promise.all([submitPage.uploadSequenceData(), submitPage.uploadMetadata()]);

        await submitPage.confirmationINSDCTerms.click();
        await submitPage.confirmationNoPII.click();
        await submitPage.submitButton.click();

        await submitPage.page.waitForURL(`${baseUrl}${routes.userSequenceReviewPage(dummyOrganism.key, groupId)}`, {
            waitUntil: 'load',
        });
    });

    test('should upload compressed files and submit', async ({ submitPage, loginAsTestUser }) => {
        const { groupId } = await loginAsTestUser();
        await submitPage.goto(groupId);

        await Promise.all([submitPage.uploadCompressedSequenceData(), submitPage.uploadCompressedMetadata()]);

        await submitPage.confirmationINSDCTerms.click();
        await submitPage.confirmationNoPII.click();
        await submitPage.submitButton.click();

        await submitPage.page.waitForURL(`${baseUrl}${routes.userSequenceReviewPage(dummyOrganism.key, groupId)}`);
    });

    test('should set data use terms', async ({ submitPage, loginAsTestUserTwo }) => {
        const { groupId } = await loginAsTestUserTwo();
        await submitPage.goto(groupId);

        await Promise.all([submitPage.uploadSequenceData(), submitPage.uploadMetadata()]);
        await submitPage.selectRestrictedDataUseTerms();
        await submitPage.confirmationINSDCTerms.click();
        await submitPage.confirmationNoPII.click();
        await submitPage.submitButton.click();

        await submitPage.page.waitForURL(`${baseUrl}${routes.userSequenceReviewPage(dummyOrganism.key, groupId)}`);
    });
});
