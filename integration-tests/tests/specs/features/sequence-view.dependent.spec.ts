import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { SingleSequenceSubmissionPage } from '../../pages/submission.page';
import { ReviewPage } from '../../pages/review.page';

test.describe('Sequence view in review card', () => {
    test('can view and navigate between sequence tabs in the review card dialog', async ({
        pageWithGroup,
    }) => {
        test.setTimeout(120000);
        const page = pageWithGroup;
        const submissionPage = new SingleSequenceSubmissionPage(pageWithGroup);

        await submissionPage.navigateToSubmissionPage('Crimean-Congo Hemorrhagic Fever Virus');
        await submissionPage.fillSubmissionForm({
            submissionId: 'TEST_SEQ_VIEW',
            collectionCountry: 'Brazil',
            collectionDate: '2023-01-15',
            authorAffiliations: 'Test Lab, University of Testing',
        });
        await submissionPage.fillSequenceData([
            'CCACATTGACACAGANAGCTCCAGTAGTGGTTCTCTGTCCTTATTAAACCATGGACTTCTTAAGAAACCTTGACTGGACTCAGGTGATTGCTAGTCAGTATGTGACCAATCCC',
            'GTGGATTGAGCATCTTAATTGCAGCATACTTGTCAACATCATGCATATATCATTGATGTATGCAGTTTTCTGCTTGCAGCTGTGCGGTCTAGGGAAAACTAACGGACTACACA',
            'GTGTTCTCTTGAGTGTTGGCAAAATGGAAAACAAAATCGAGGTGAACAACAAAGATGAGATGAACAAATGGTTTGAGGAGTTCAAGAAAGGAAATGGACTTGTGGACACTTTC',
        ]);
        await submissionPage.acceptTerms();
        await submissionPage.submitSequence();

        await expect(
            page.getByRole('heading', { name: 'Review current submissions' }),
        ).toBeVisible();

        const reviewPage = new ReviewPage(page);

        await reviewPage.waitForZeroProcessing();
        await reviewPage.viewSequences();

        const dialogTitle = page.getByText('Processed sequences', { exact: true });
        await expect(dialogTitle).toBeVisible();

        const sequenceContent = await reviewPage.getSequenceContent();

        expect(sequenceContent.length).toBeGreaterThan(10);

        const availableTabs = await reviewPage.getAvailableSequenceTabs();
        expect(availableTabs.length).toBeGreaterThan(0);

        await reviewPage.switchSequenceTab(availableTabs[1]);
        const alignedContent = await reviewPage.getSequenceContent();
        expect(alignedContent.length).toBeGreaterThan(10);

        await reviewPage.switchSequenceTab(availableTabs[0]);

        await reviewPage.closeSequencesDialog();
        await expect(dialogTitle).toBeHidden();

        await reviewPage.releaseValidSequences();
    });
});
