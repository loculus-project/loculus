import { expect } from '@playwright/test';
import { test } from '../../../fixtures/group.fixture';
import { SingleSequenceSubmissionPage } from '../../../pages/submission.page';
import { ReviewPage } from '../../../pages/review.page';
import { SearchPage } from '../../../pages/search.page';
import { v4 as uuidv4 } from 'uuid';

// Integration test for substring search on author affiliations

test.describe('Substring Search', () => {
    test('author affiliation substring returns results', async ({ pageWithGroup }) => {
        test.setTimeout(120000);

        const page = pageWithGroup;
        const substring = uuidv4().slice(0, 5);
        const sequence = 'ATTGATCTCATCATTTACCAATTGGAGACCGTTTAACTAGTCAATCCCC';
        const submissionPage = new SingleSequenceSubmissionPage(pageWithGroup);
        let reviewPage: ReviewPage;

        // first sequence containing the substring
        reviewPage = await submissionPage.completeSubmission(
            {
                submissionId: 'sub1',
                collectionCountry: 'France',
                collectionDate: '2025-05-01',
                authorAffiliations: `Lab ${substring} One`,
            },
            { main: sequence },
        );
        await reviewPage.waitForZeroProcessing();
        await reviewPage.releaseValidSequences();

        // second sequence containing the substring
        reviewPage = await submissionPage.completeSubmission(
            {
                submissionId: 'sub2',
                collectionCountry: 'France',
                collectionDate: '2025-05-02',
                authorAffiliations: `Institute ${substring} Two`,
            },
            { main: sequence },
        );
        await reviewPage.waitForZeroProcessing();
        await reviewPage.releaseValidSequences();

        await page.getByRole('link', { name: 'released sequences' }).click();
        while (!(await page.getByRole('link', { name: /LOC_/ }).isVisible())) {
            await page.reload();
            await page.waitForTimeout(2000);
        }

        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();
        await searchPage.enableSearchFields('Author affiliations');
        await searchPage.fill('Author affiliations', substring);
        await expect(page.getByText(`Author affiliations:${substring}`)).toBeVisible();
        await searchPage.expectSequenceCount(2);

        // negative case: substring with no matching results
        await page.getByLabel('remove filter').click();
        await searchPage.fill('Author affiliations', 'no_match');
        await searchPage.expectSequenceCount(0);
    });
});
