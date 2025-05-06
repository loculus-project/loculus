import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { SingleSequenceSubmissionPage } from '../../pages/singlesubmission.page';
import { ReviewPage } from '../../pages/review.page';

test.describe('Sequence N trimming functionality', () => {
    test('correctly trims N characters from the beginning and end of unaligned sequences', async ({
        pageWithGroup,
    }) => {
        test.setTimeout(120000);
        const page = pageWithGroup;
        const submissionPage = new SingleSequenceSubmissionPage(pageWithGroup);

        // Submit a sequence with leading and trailing N's
        await submissionPage.navigateToSubmissionPage('Crimean-Congo Hemorrhagic Fever Virus');
        await submissionPage.fillSubmissionForm({
            submissionId: 'TRIM_NS_TEST',
            collectionCountry: 'Switzerland',
            collectionDate: '2023-05-10',
            authorAffiliations: 'N-Trimming Lab, University of Testing',
        });

        // Create sequences with leading and trailing Ns
        const lSegmentWithNs =
            'NNNNNNNNNNTTCAACAAGCAAAGCCAACTGTGACGGTGTTCTATATGCTAAAAGGTAACTTGATGAACACAGAGCCAACAGTTGCTGAGCTTGTCAGCTATGGTATAAAGGAAGGCAGGTTTTATAGGCTTTCCGACACCGGAATCAATGCAACCACATANNNNNN';

        await submissionPage.fillSequenceData({
            L: lSegmentWithNs,
        });

        await submissionPage.acceptTerms();
        const reviewPage = await submissionPage.submitSequence();

        await expect(
            page.getByRole('heading', { name: 'Review current submissions' }),
        ).toBeVisible();

        // Wait for processing to complete
        await reviewPage.waitForZeroProcessing();

        await reviewPage.viewSequences();

        // Get the sequence content and verify trimming
        const sequenceContent = await reviewPage.getSequenceContent();

        // Verify that the Ns have been trimmed in the unaligned sequences view
        const tabs = await reviewPage.getAvailableSequenceTabs();

        // Find the unaligned tab
        const LunalignedTab = tabs.find((tab) => tab.toLowerCase().includes('L (unaligned)'));

        const lSegmentTrimmed =
            'TTCAACAAGCAAAGCCAACTGTGACGGTGTTCTATATGCTAAAAGGTAACTTGATGAACACAGAGCCAACAGTTGCTGAGCTTGTCAGCTATGGTATAAAGGAAGGCAGGTTTTATAGGCTTTCCGACACCGGAATCAATGCAACCACATA';

        const checkTab = async (tab, expectedData) => {
            await reviewPage.switchSequenceTab(tab);
            const content = await reviewPage.getSequenceContent();
            expect(content.replace(/\s+/g, '')).toEqual(expectedData.replace(/\s+/g, ''));
        };
        await checkTab(LunalignedTab, lSegmentTrimmed);

        await reviewPage.closeSequencesDialog();

        await reviewPage.releaseValidSequences();
    });
});
