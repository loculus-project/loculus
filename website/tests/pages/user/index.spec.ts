import { approveProcessedData } from '../../../src/components/UserSequenceList/approveProcessedData';
import { expect, test, testuser } from '../../e2e.fixture';
import { fakeProcessingPipeline, fakeUnprocessedDataQuery } from '../../util/preprocessingPipeline';

test.describe('The user page', () => {
    test('should show sequences, their status and a link to reviews', async ({ submitPage, userPage }) => {
        await submitPage.goto();
        await submitPage.submit();

        const sequences = await fakeUnprocessedDataQuery(2);
        expect(sequences.length).toBe(2);
        const [firstId, secondId] = sequences.map((entry) => entry.sequenceId);

        await fakeProcessingPipeline({ sequenceId: firstId, error: true });
        const reviewStatus = await userPage.gotoUserPageAndLocateSequenceWithStatus(firstId, 'NEEDS_REVIEW');
        await expect(reviewStatus).toBeVisible();

        await fakeProcessingPipeline({ sequenceId: secondId, error: false });
        const processedStatus = await userPage.gotoUserPageAndLocateSequenceWithStatus(secondId, 'PROCESSED');
        await expect(processedStatus).toBeVisible();

        await approveProcessedData(testuser, [secondId]);
        const approvedStatus = await userPage.gotoUserPageAndLocateSequenceWithStatus(secondId, 'SILO_READY');
        await expect(approvedStatus).toBeVisible();
    });
});
