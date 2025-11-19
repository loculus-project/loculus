import { test as sequenceTest } from '../../fixtures/sequence.fixture';
import { test as groupTest } from '../../fixtures/group.fixture';
import { expect } from '@playwright/test';
import { SearchPage } from '../../pages/search.page';
import { ReviewPage } from '../../pages/review.page';
import { RevisionPage } from '../../pages/revision.page';
import { NavigationPage } from '../../pages/navigation.page';

import { SingleSequenceSubmissionPage } from '../../pages/submission.page';
import {
    createTestMetadata,
    createTestSequenceData,
    createRevisionMetadataTsv,
    createFastaContent,
    EBOLA_SUDAN_SHORT_SEQUENCE,
} from '../../test-helpers/test-data';

const TEST_ORGANISM = 'ebola-sudan';
const SEQUENCES_TO_REVISE = 3;
const SEARCH_INDEXING_TIMEOUT = 60000;
const BULK_REVISION_TEST_TIMEOUT = 120000;

sequenceTest(
    'revising sequence data works: segment can be deleted; segment can be edited',
    async ({ pageWithReleasedSequence: page }) => {
        sequenceTest.setTimeout(60000);
        const searchPage = new SearchPage(page);

        await searchPage.cchf();
        const navigation = new NavigationPage(page);
        await navigation.clickSubmitSequences();
        await page.getByRole('link', { name: "View View your group's" }).click();

        const loculusId = await searchPage.waitForLoculusId();
        expect(loculusId).toBeTruthy();

        await searchPage.clickOnSequence(0);

        await page.getByRole('link', { name: 'Revise this sequence' }).click({ timeout: 15000 });
        await expect(page.getByRole('heading', { name: 'Create new revision from' })).toBeVisible();

        await page.getByTestId('discard_L_segment_file').click();
        await page.getByTestId('discard_S_segment_file').click();
        await page.getByTestId('S_segment_file').setInputFiles({
            name: 'update_S.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('AAAAA'),
        });

        await page.getByRole('button', { name: 'Submit' }).click();
        await page.getByRole('button', { name: 'Confirm' }).click();

        const reviewPage = new ReviewPage(page);
        await reviewPage.waitForZeroProcessing();
        await reviewPage.viewSequences();

        const tabs = await reviewPage.getAvailableSequenceTabs();
        expect(tabs).not.toContain('L (aligned)');
        expect(tabs).not.toContain('L (unaligned)');
        expect(tabs).toContain('S (unaligned)');

        await reviewPage.switchSequenceTab('S (unaligned)');
        expect(await reviewPage.getSequenceContent()).toBe('AAAAA');

        await reviewPage.closeSequencesDialog();
    },
);

groupTest.describe('Bulk sequence revision', () => {
    groupTest(
        'can revise multiple sequences via file upload',
        async ({ pageWithGroup, groupId }) => {
            groupTest.setTimeout(BULK_REVISION_TEST_TIMEOUT);
            const page = pageWithGroup;

            const submissionPage = new SingleSequenceSubmissionPage(page);
            const timestamp = Date.now();
            for (let i = 0; i < SEQUENCES_TO_REVISE; i++) {
                await submissionPage.completeSubmission(
                    createTestMetadata({ submissionId: `bulk-revise-${timestamp}-${i}` }),
                    createTestSequenceData(),
                );
            }

            const reviewPage = new ReviewPage(page);
            await reviewPage.goto(groupId);
            await reviewPage.waitForZeroProcessing();
            await reviewPage.releaseValidSequences();

            const searchPage = new SearchPage(page);
            await searchPage.searchByGroupId(TEST_ORGANISM, groupId);
            const accessions = await searchPage.waitForSequencesInSearch(
                SEQUENCES_TO_REVISE,
                SEARCH_INDEXING_TIMEOUT,
            );

            const accessionsToRevise = accessions.slice(0, SEQUENCES_TO_REVISE);
            const baseSubmissionId = `bulk-revise-updated-${Date.now()}`;
            const revisionMetadata = createRevisionMetadataTsv(
                accessionsToRevise,
                baseSubmissionId,
            );

            const revisedSequences = accessionsToRevise.map((accession, i) => ({
                id: `${baseSubmissionId}-${i}`,
                sequence: EBOLA_SUDAN_SHORT_SEQUENCE + 'GGGGGG',
            }));
            const fastaContent = createFastaContent(revisedSequences);

            const revisionPage = new RevisionPage(page);
            await revisionPage.goto(TEST_ORGANISM, groupId);
            await revisionPage.uploadMetadataFile('revision_metadata.tsv', revisionMetadata);
            await revisionPage.uploadSequenceFile('revised_sequences.fasta', fastaContent);
            await revisionPage.acceptTerms();
            await revisionPage.clickSubmit();

            await expect(page).toHaveURL(/\/review/);
            await reviewPage.waitForZeroProcessing();

            const overview = await reviewPage.getReviewPageOverview();
            expect(overview.total).toBeGreaterThanOrEqual(SEQUENCES_TO_REVISE);
        },
    );
});