import { test as sequenceTest } from '../../fixtures/sequence.fixture';
import { test as groupTest } from '../../fixtures/group.fixture';
import { expect } from '@playwright/test';
import { SearchPage } from '../../pages/search.page';
import { ReviewPage } from '../../pages/review.page';
import { RevisionPage } from '../../pages/revision.page';
import { NavigationPage } from '../../pages/navigation.page';
import { SingleSequenceSubmissionPage } from '../../pages/submission.page';
import {
    CCHF_S_SEGMENT_FULL_SEQUENCE,
    createFastaContent,
    createRevisionMetadataTsv,
    createTestMetadata,
    createTestSequenceData,
    EBOLA_SUDAN_SHORT_SEQUENCE,
    removeWhitespaces,
} from '../../test-helpers/test-data';

const TEST_ORGANISM = 'ebola-sudan';
const SEQUENCES_TO_REVISE = 3;
const SEARCH_INDEXING_TIMEOUT = 60000;

sequenceTest(
    'revising sequence data works: segment can be deleted; segment can be edited',
    async ({ page, releasedSequence }) => {
        void releasedSequence;
        sequenceTest.setTimeout(200_000);

        const searchPage = new SearchPage(page);
        await searchPage.cchf();

        const navigation = new NavigationPage(page);
        await navigation.clickSubmitSequences();

        await page.getByRole('link', { name: "View View your group's" }).click();
        await searchPage.waitForSequencesInSearch(1);

        await searchPage.clickOnSequence(0);

        await searchPage.reviseSequence();

        await page.getByTestId(/^discard_edited_L/).click();
        await page.getByTestId(/^discard_edited_S/).click();
        await page.getByTestId('Add a segment_segment_file').setInputFiles({
            name: 'update_S.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('>S description\n' + CCHF_S_SEGMENT_FULL_SEQUENCE),
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
        const actual = removeWhitespaces(await reviewPage.getSequenceContent());
        expect(actual).toBe(CCHF_S_SEGMENT_FULL_SEQUENCE);

        await reviewPage.closeSequencesDialog();
    },
);

groupTest.describe('Revision page template downloads', () => {
    groupTest('can download revision metadata templates', async ({ page, groupId }) => {
        const revisionPage = new RevisionPage(page);
        await revisionPage.goto(TEST_ORGANISM, groupId);

        const tsvDownload = await revisionPage.downloadTsvTemplate();
        expect(tsvDownload.suggestedFilename()).toContain('.tsv');

        const xlsxDownload = await revisionPage.downloadXlsxTemplate();
        expect(xlsxDownload.suggestedFilename()).toContain('.xlsx');
    });
});

groupTest.describe('Bulk sequence revision', () => {
    groupTest('can revise multiple sequences via file upload', async ({ page, groupId }) => {
        groupTest.setTimeout(200_000);

        const submissionPage = new SingleSequenceSubmissionPage(page);
        const timestamp = Date.now();

        // TODO #5524 Optimize by using bulk submission instead of 3 sequential single submissions
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
        const accessionVersions = await searchPage.waitForSequencesInSearch(
            SEQUENCES_TO_REVISE,
            SEARCH_INDEXING_TIMEOUT,
        );

        const accessionsToRevise = accessionVersions.slice(0, SEQUENCES_TO_REVISE);
        const baseSubmissionId = `bulk-revise-updated-${Date.now()}`;
        const revisionMetadata = createRevisionMetadataTsv(accessionsToRevise, baseSubmissionId);

        const revisedSequences = accessionsToRevise.map((_, i) => ({
            id: `${baseSubmissionId}-${i} description`,
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
    });
});
