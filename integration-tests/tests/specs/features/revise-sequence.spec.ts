import { test as groupTest } from '../../fixtures/group.fixture';
import { expect } from '@playwright/test';
import { SearchPage } from '../../pages/search.page';
import { ReviewPage } from '../../pages/review.page';
import { RevisionPage } from '../../pages/revision.page';
import { SingleSequenceSubmissionPage } from '../../pages/submission.page';
import {
    createTestMetadata,
    createTestSequenceData,
    createRevisionMetadataTsv,
    createFastaContent,
    EBOLA_SUDAN_SHORT_SEQUENCE,
} from '../../test-helpers/test-data';

// Test configuration constants
const TEST_ORGANISM = 'ebola-sudan';
const SEQUENCES_TO_REVISE = 3;
const SEARCH_INDEXING_TIMEOUT = 60000; // 60 seconds for search indexing after release
const BULK_REVISION_TEST_TIMEOUT = 120000;

groupTest.describe('Bulk sequence revision', () => {
    groupTest(
        'can revise multiple sequences via file upload',
        async ({ pageWithGroup, groupId }) => {
            groupTest.setTimeout(BULK_REVISION_TEST_TIMEOUT);
            const page = pageWithGroup;

            // Submit multiple sequences for testing bulk revision
            const submissionPage = new SingleSequenceSubmissionPage(page);
            const timestamp = Date.now();
            for (let i = 0; i < SEQUENCES_TO_REVISE; i++) {
                await submissionPage.completeSubmission(
                    createTestMetadata({ submissionId: `bulk-revise-${timestamp}-${i}` }),
                    createTestSequenceData(),
                );
            }

            // Approve and release the sequences
            const reviewPage = new ReviewPage(page);
            await reviewPage.goto(groupId);
            await reviewPage.waitForZeroProcessing();
            await reviewPage.releaseValidSequences();

            // Wait for sequences to appear in search after release
            const searchPage = new SearchPage(page);
            await searchPage.searchByGroupId(TEST_ORGANISM, groupId);
            const accessions = await searchPage.waitForSequencesInSearch(
                SEQUENCES_TO_REVISE,
                SEARCH_INDEXING_TIMEOUT,
            );

            // Prepare bulk revision files
            const accessionsToRevise = accessions.slice(0, SEQUENCES_TO_REVISE);
            const baseSubmissionId = `bulk-revise-updated-${Date.now()}`;
            const revisionMetadata = createRevisionMetadataTsv(
                accessionsToRevise,
                baseSubmissionId,
            );

            const revisedSequences = accessionsToRevise.map((accession, i) => ({
                id: `${baseSubmissionId}-${i}`,
                sequence: EBOLA_SUDAN_SHORT_SEQUENCE + 'GGGGGG', // Modified sequence
            }));
            const fastaContent = createFastaContent(revisedSequences);

            // Submit the bulk revision
            const revisionPage = new RevisionPage(page);
            await revisionPage.goto(TEST_ORGANISM, groupId);
            await revisionPage.uploadMetadataFile('revision_metadata.tsv', revisionMetadata);
            await revisionPage.uploadSequenceFile('revised_sequences.fasta', fastaContent);
            await revisionPage.acceptTerms();
            await revisionPage.clickSubmit();

            // Verify submission was successful
            await expect(page).toHaveURL(/\/review/);
            await reviewPage.waitForZeroProcessing();

            const overview = await reviewPage.getReviewPageOverview();
            expect(overview.total).toBeGreaterThanOrEqual(SEQUENCES_TO_REVISE);
        },
    );
});
