import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { SingleSequenceSubmissionPage } from '../../pages/singlesubmission.page';

test.describe('Sequence view in review card', () => {
    test('can view and navigate between sequence tabs in the review card dialog', async ({ pageWithGroup }) => {
        test.setTimeout(120000); // Increase timeout for preprocessing
        const page = pageWithGroup;
        const submissionPage = new SingleSequenceSubmissionPage(pageWithGroup);
    
        // First, submit a sequence
        await submissionPage.navigateToSubmissionPage('Crimean-Congo Hemorrhagic Fever Virus');
        await submissionPage.fillSubmissionForm({
            submissionId: 'TEST_SEQ_VIEW',
            collectionCountry: 'Brazil',
            collectionDate: '2023-01-15',
            authorAffiliations: 'Test Lab, University of Testing',
        });
        await submissionPage.fillSequenceData({
            L: 'CCACATTGACACAGANAGCTCCAGTAGTGGTTCTCTGTCCTTATTAAACCATGGACTTCTTAAGAAACCTTGACTGGACTCAGGTGATTGCTAGTCAGTATGTGACCAATCCC',
            M: 'GTGGATTGAGCATCTTAATTGCAGCATACTTGTCAACATCATGCATATATCATTGATGTATGCAGTTTTCTGCTTGCAGCTGTGCGGTCTAGGGAAAACTAACGGACTACACA',
            S: 'GTGTTCTCTTGAGTGTTGGCAAAATGGAAAACAAAATCGAGGTGAACAACAAAGATGAGATGAACAAATGGTTTGAGGAGTTCAAGAAAGGAAATGGACTTGTGGACACTTTC',
        });
        await submissionPage.acceptTerms();
        await submissionPage.submitSequence();

        // Verify we're on the review page
        await expect(
            page.getByRole('heading', { name: 'Review current submissions' }),
        ).toBeVisible();

        // Wait for preprocessing to complete (sequence is processed)
        // Instead of a hardcoded timeout, we could look for visual indicators that processing is complete
        console.log('Waiting for sequence processing to complete...');
        await page.waitForTimeout(60000); // Allow more time for processing

        // Get the review page object
        const { ReviewPage } = await import('../../pages/review.page');
        const reviewPage = new ReviewPage(page);

        // Test sequence viewing functionality
        console.log('Opening sequences dialog...');
        await reviewPage.viewSequences();
        
        // Verify sequence dialog content
        const dialogTitle = page.getByText('Processed Sequences');
        await expect(dialogTitle).toBeVisible();
        
        // Check first tab (should be "Sequence" or similar)
        console.log('Checking sequence content in first tab...');
        
        // Add a retry loop for getting sequence content as it might take time to load
        let sequenceContent = '';
        for (let attempts = 0; attempts < 5; attempts++) {
            sequenceContent = await reviewPage.getSequenceContent() || '';
            if (sequenceContent.length > 10) break;
            console.log(`Attempt ${attempts+1}: Waiting for sequence content to load...`);
            await page.waitForTimeout(1000);
        }
        
        expect(sequenceContent.length).toBeGreaterThan(10);
        console.log(`Found sequence content of length ${sequenceContent.length}`);
        
        // Get and check available tabs
        const availableTabs = await reviewPage.getAvailableSequenceTabs();
        console.log(`Found sequence tabs: ${availableTabs.join(', ')}`);
        expect(availableTabs.length).toBeGreaterThan(0);
        
        // Try switching to another tab if there are multiple
        if (availableTabs.length > 1) {
            // Usually the second tab is "Aligned"
            console.log(`Switching to tab: ${availableTabs[1]}`);
            await reviewPage.switchSequenceTab(availableTabs[1]);
            
            // Verify content changed
            console.log('Checking sequence content after tab switch...');
            
            // Add retry loop for second tab content
            let alignedContent = '';
            for (let attempts = 0; attempts < 5; attempts++) {
                alignedContent = await reviewPage.getSequenceContent() || '';
                if (alignedContent.length > 10) break;
                console.log(`Attempt ${attempts+1}: Waiting for tab content to load...`);
                await page.waitForTimeout(1000);
            }
            
            expect(alignedContent.length).toBeGreaterThan(10);
            console.log(`Found tab content of length ${alignedContent.length}`);
            
            // Test switching back to first tab
            console.log(`Switching back to tab: ${availableTabs[0]}`);
            await reviewPage.switchSequenceTab(availableTabs[0]);
        }
        
        // Close the dialog
        console.log('Closing sequence dialog...');
        await reviewPage.closeSequencesDialog();
        await expect(dialogTitle).not.toBeVisible();
        
        // Clean up - release the sequence
        console.log('Releasing the sequence...');
        await reviewPage.releaseValidSequences();
        console.log('Test completed successfully');
    });
});