import { approveProcessedData } from '../../../src/components/UserSequenceList/approveProcessedData';
import { expect, test, testuser } from '../../e2e.fixture';
import { fakeProcessingPipeline } from '../../util/preprocessingPipeline';

test.describe('The user page', () => {
    test('should show sequences, their status and a link to reviews', async ({ submitPage, userPage }) => {
        const submitResponse = await submitPage.submitDataViaApi();
        expect(submitResponse.length).toBeGreaterThanOrEqual(2);
        const [firstId, secondId] = submitResponse.map((entry) => entry.sequenceId);
        expect(firstId).toBeDefined();
        expect(secondId).toBeDefined();

        await fakeUnprocessedDataQuery();

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

async function fakeUnprocessedDataQuery() {
    let unprocessedData = 'should be empty when all data is processing';

    while (unprocessedData !== '') {
        const response = await fetch('http://localhost:8079/extract-unprocessed-data?numberOfSequences=10', {
            method: 'POST',
        });

        if (!response.ok) {
            throw new Error(`Unexpected response: ${response.statusText}`);
        }

        unprocessedData = await response.text();
    }
}
