import { routes } from '../../../src/routes.ts';
import { restrictedDataUseTermsType } from '../../../src/types/backend.ts';
import { dateTimeInMonths } from '../../../src/utils/DateTimeInMonths.tsx';
import { baseUrl, dummyOrganism, expect, test, testSequenceCount } from '../../e2e.fixture';

test.describe('The submit page', () => {
    test('should upload files and submit', async ({ submitPage, loginAsTestUser }) => {
        await loginAsTestUser();
        await submitPage.goto();

        await Promise.all([submitPage.uploadSequenceData(), submitPage.uploadMetadata()]);

        await submitPage.submitButton.click();

        // TODO(#702): Redirect to the review page after submission is successful
        // await submitPage.page.waitForURL(`${baseUrl}${routes.userSequenceReviewPage(dummyOrganism.key)}`);
    });

    test('should upload compressed files and submit', async ({ submitPage, loginAsTestUser }) => {
        await loginAsTestUser();
        await submitPage.goto();

        await Promise.all([submitPage.uploadCompressedSequenceData(), submitPage.uploadCompressedMetadata()]);

        await submitPage.submitButton.click();

        // TODO(#702): Redirect to the review page after submission is successful
        // await submitPage.page.waitForURL(`${baseUrl}${routes.userSequenceReviewPage(dummyOrganism.key)}`);
    });

    test('should set data use terms', async ({ submitPage, loginAsTestUser }) => {
        await loginAsTestUser();
        await submitPage.goto();

        await Promise.all([submitPage.uploadSequenceData(), submitPage.uploadMetadata()]);
        await submitPage.selectRestrictedDataUseTerms();

        await submitPage.submitButton.click();
        await expect(submitPage.page.getByText('Response Sequence Headers')).toBeVisible();

        const responseHeaderLocator = submitPage.page.getByText(
            `${restrictedDataUseTermsType} until: ${dateTimeInMonths(6).toFormat('yyyy-MM-dd')}`,
            {
                exact: false,
            },
        );
        expect(await responseHeaderLocator.count()).toBe(testSequenceCount);

        // TODO(#702): Redirect to the review page after submission is successful, and check the data use terms there
    });
});
