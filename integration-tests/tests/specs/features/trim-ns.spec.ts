import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { SingleSequenceSubmissionPage } from '../../pages/submission.page';

test.describe('Sequence N trimming functionality', () => {
    test('correctly trims N characters from the beginning and end of unaligned sequences', async ({
        page,
        groupId,
    }) => {
        test.setTimeout(120000);
        void groupId;
        const submissionPage = new SingleSequenceSubmissionPage(page);

        await submissionPage.navigateToSubmissionPage('Crimean-Congo Hemorrhagic Fever Virus');
        await submissionPage.fillSubmissionForm({
            submissionId: 'TRIM_NS_TEST',
            collectionCountry: 'Switzerland',
            collectionDate: '2023-05-10',
            authorAffiliations: 'N-Trimming Lab, University of Testing',
        });

        const lSegmentWithNs =
            'NNNNNNNNNNTTCAACAAGCAAAGCCAACTGTGACGGTGTTCTATATGCTAAAAGGTAACTTGATGAACACAGAGCCAACAGTTGCTGAGCTTGTCAGCTATGGTATAAAGGAAGGCAGGTTTTATAGGCTTTCCGACACCGGAATCAATGCAACCACATANNNNNN';

        const fastaHeaderL = 'TRIM_NS_TEST_L';
        await submissionPage.fillSequenceData({
            [fastaHeaderL]: lSegmentWithNs,
        });

        await submissionPage.acceptTerms();
        const reviewPage = await submissionPage.submitSequence();

        await expect(
            page.getByRole('heading', { name: 'Review current submissions' }),
        ).toBeVisible();

        await reviewPage.waitForZeroProcessing();

        await reviewPage.viewSequences();

        await reviewPage.getSequenceContent();

        const tabs = await reviewPage.getAvailableSequenceTabs();

        const lUnalignedTab = tabs.find((tab) => tab.toLowerCase().includes('L (unaligned)'));

        const lSegmentTrimmed =
            'TTCAACAAGCAAAGCCAACTGTGACGGTGTTCTATATGCTAAAAGGTAACTTGATGAACACAGAGCCAACAGTTGCTGAGCTTGTCAGCTATGGTATAAAGGAAGGCAGGTTTTATAGGCTTTCCGACACCGGAATCAATGCAACCACATA';

        const checkTab = async (tab: string, expectedData: string) => {
            await reviewPage.switchSequenceTab(tab);
            const content = await reviewPage.getSequenceContent();
            expect(content.replace(/\s+/g, '')).toEqual(expectedData.replace(/\s+/g, ''));
        };
        await checkTab(lUnalignedTab, lSegmentTrimmed);

        await reviewPage.closeSequencesDialog();

        await reviewPage.releaseValidSequences();
    });
});
