import { test as groupTest } from './group.fixture';
import { expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import { SingleSequenceSubmissionPage } from '../pages/submission.page';
import {
    CCHF_L_SEGMENT_FULL_SEQUENCE,
    CCHF_M_SEGMENT_FULL_SEQUENCE,
    CCHF_S_SEGMENT_FULL_SEQUENCE,
    removeWhitespaces,
} from '../test-helpers/test-data';

type SequenceFixtures = {
    releasedSequence: string;
};

export const test = groupTest.extend<SequenceFixtures>({
    releasedSequence: [
        async ({ page, groupId }, use) => {
            // Ensure group is created by depending on groupId
            void groupId;

            const submissionPage = new SingleSequenceSubmissionPage(page);
            const submissionId = `test_${randomUUID().slice(0, 8)}`;

            await submissionPage.navigateToSubmissionPage('Crimean-Congo Hemorrhagic Fever Virus');
            await submissionPage.fillSubmissionForm({
                submissionId: submissionId,
                collectionCountry: 'France',
                collectionDate: '2021-10-15',
                authorAffiliations: 'Test Institute, France',
            });

            await submissionPage.fillSequenceData({
                fastaHeaderL: removeWhitespaces(CCHF_L_SEGMENT_FULL_SEQUENCE),
                fastaHeaderM: removeWhitespaces(CCHF_M_SEGMENT_FULL_SEQUENCE),
                fastaHeaderS: removeWhitespaces(CCHF_S_SEGMENT_FULL_SEQUENCE),
            });

            await submissionPage.acceptTerms();
            const reviewPage = await submissionPage.submitSequence();
            await reviewPage.waitForAllProcessed();
            const editPage = await reviewPage.editFirstSequence();

            await editPage.discardSequenceFileByTestId(
                'discard_fastaHeaderL (mapped to L)_segment_file',
            );
            await editPage.addSequenceFile(CCHF_L_SEGMENT_FULL_SEQUENCE, 'edited_L.txt');
            await editPage.discardSequenceFileByTestId(
                'discard_fastaHeaderM (mapped to M)_segment_file',
            );
            await editPage.addSequenceFile(CCHF_M_SEGMENT_FULL_SEQUENCE, 'edited_M.txt');
            await editPage.discardSequenceFileByTestId(
                'discard_fastaHeaderS (mapped to S)_segment_file',
            );
            await editPage.addSequenceFile(`>edited_S\n${CCHF_S_SEGMENT_FULL_SEQUENCE}`);
            await editPage.fillField('Authors', 'Integration, Test');
            await editPage.submitChanges();
            await reviewPage.releaseValidSequences();

            await page.getByRole('link', { name: 'Released Sequences' }).click();
            await expect
                .poll(
                    async () => {
                        await page.reload();
                        return page.getByRole('link', { name: /LOC_/ }).isVisible();
                    },
                    {
                        message: 'Link with name /LOC_/ never became visible.',
                        timeout: 90000,
                    },
                )
                .toBe(true);

            await use(submissionId);
        },
        {
            timeout: 90000,
        },
    ],
});
