import { restrictedDataUseTermsType } from '../../../src/types/backend.ts';
import { dateTimeInMonths } from '../../../src/utils/DateTimeInMonths.tsx';
import { expect, test, testSequenceCount } from '../../e2e.fixture';

test.describe('The submit page', () => {
    test('should upload files and submit', async ({ submitPage, loginAsTestUser }) => {
        await loginAsTestUser();
        await submitPage.goto();

        await Promise.all([submitPage.uploadSequenceData(), submitPage.uploadMetadata()]);

        await expect(submitPage.page.getByText('Response Sequence Headers')).not.toBeVisible();
        await submitPage.submitButton.click();
        await expect(submitPage.page.getByText('Response Sequence Headers')).toBeVisible();
    });

    test('should upload compressed files and submit', async ({ submitPage, loginAsTestUser }) => {
        await loginAsTestUser();
        await submitPage.goto();

        await Promise.all([submitPage.uploadCompressedSequenceData(), submitPage.uploadCompressedMetadata()]);

        await expect(submitPage.page.getByText('Response Sequence Headers')).not.toBeVisible();
        await submitPage.submitButton.click();
        await expect(submitPage.page.getByText('Response Sequence Headers')).toBeVisible();
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
    });
});
