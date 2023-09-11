import { approveProcessedData } from '../../../src/components/UserSequenceList/approveProcessedData.ts';
import { expect, test, testuser } from '../../e2e.fixture';
import { fakeProcessingPipeline, fakeUnprocessedDataQuery } from '../../util/preprocessingPipeline.ts';

test.describe('The revise page', () => {
    test('should upload files and revise existing data', async ({ revisePage, submitPage, userPage }) => {
        await submitPage.goto();
        await submitPage.submit();

        const sequences = await fakeUnprocessedDataQuery(submitPage.getTestSequenceCount());
        expect(sequences.length).toBe(submitPage.getTestSequenceCount());

        for (const sequence of sequences) {
            await fakeProcessingPipeline({ sequenceId: sequence.sequenceId, error: false });
        }
        await approveProcessedData(
            testuser,
            sequences.map((entry) => entry.sequenceId),
        );

        await revisePage.goto();
        await expect(revisePage.page.getByText('Result of Revision')).not.toBeVisible();
        await revisePage.submitRevisedData(sequences.map((entry) => entry.sequenceId));
        await expect(revisePage.page.getByText('Result of Revision')).toBeVisible();

        const locatorToCheck = [
            ...(await userPage.gotoUserPageAndLocatorForSequence(
                sequences.map((sequence) => ({
                    sequenceId: sequence.sequenceId,
                    version: sequence.version,
                    status: 'RECEIVED',
                })),
            )),
            ...(await userPage.gotoUserPageAndLocatorForSequence(
                sequences.map((sequence) => ({
                    sequenceId: sequence.sequenceId,
                    version: sequence.version,
                    status: 'SILO_READY',
                })),
            )),
        ];

        await Promise.all(locatorToCheck.map(async (locator) => expect(locator).toBeVisible()));
    });
});
