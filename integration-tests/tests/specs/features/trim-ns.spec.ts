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
        const lSegmentWithNs = 'NNNNNCCACATTGACACAGAGAGCTCCAGTAGTGGTTCTCTGTCCTTATTAAACCATGGACTTCTTNNNN';
        const mSegmentWithNs = 'NNNNGTGGATTGAGCATCTTAATTGCAGCATACTTGTCAACATCATGCATATATCATTGATGTATNNN';
        const sSegmentWithNs = 'NNGTGTTCTCTTGAGTGTTGGCAAAATGGAAAACAAAATCGAGGTGAACAACAAAGATGAGATGAAN';

        await submissionPage.fillSequenceData({
            L: lSegmentWithNs,
            M: mSegmentWithNs,
            S: sSegmentWithNs,
        });
        
        await submissionPage.acceptTerms();
        const reviewPage = await submissionPage.submitSequence();

        await expect(
            page.getByRole('heading', { name: 'Review current submissions' }),
        ).toBeVisible();

        // Wait for processing to complete
        await reviewPage.waitForZeroProcessing();
        
        // View the sequences
        await reviewPage.viewSequences();

        // Get the sequence content and verify trimming
        const sequenceContent = await reviewPage.getSequenceContent();
        
        // Verify that the Ns have been trimmed in the unaligned sequences view
        const tabs = await reviewPage.getAvailableSequenceTabs();
        // Find the unaligned tab
        const unalignedTab = tabs.find(tab => tab.toLowerCase().includes('unaligned'));
        
        if (unalignedTab) {
            await reviewPage.switchSequenceTab(unalignedTab);
            const lSegmentTrimmed = 'CCACATTGACACAGAGAGCTCCAGTAGTGGTTCTCTGTCCTTATTAAACCATGGACTTCTT';
            const mSegmentTrimmed = 'GTGGATTGAGCATCTTAATTGCAGCATACTTGTCAACATCATGCATATATCATTGATGTAT';
            const sSegmentTrimmed = 'GTGTTCTCTTGAGTGTTGGCAAAATGGAAAACAAAATCGAGGTGAACAACAAAGATGAGATGAA';
            
            const unalignedContent = await reviewPage.getSequenceContent();
            
            // Check if the trimmed sequences are present in the unaligned content
            expect(unalignedContent).toContain(lSegmentTrimmed);
            expect(unalignedContent).toContain(mSegmentTrimmed);
            expect(unalignedContent).toContain(sSegmentTrimmed);
            
            // Make sure the leading/trailing Ns are NOT present in the unaligned view
            expect(unalignedContent).not.toContain(lSegmentWithNs);
            expect(unalignedContent).not.toContain(mSegmentWithNs);
            expect(unalignedContent).not.toContain(sSegmentWithNs);
        } else {
            throw new Error("Couldn't find unaligned tab for sequence verification");
        }

        // Close the dialog
        await reviewPage.closeSequencesDialog();
        
        // Release the sequence
        await reviewPage.releaseValidSequences();
    });
});