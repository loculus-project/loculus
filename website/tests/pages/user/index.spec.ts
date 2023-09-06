import { approveProcessedData } from '../../../src/components/UserSequenceList/approveProcessedData';
import { expect, test, testuser } from '../../e2e.fixture';
import { fakeProcessingPipeline } from '../../util/preprocessingPipeline';

test.describe('The user page', () => {
    test('should show sequences, their status and a link to reviews', async ({ submitPage }) => {
        const submitResponse = await submitPage.submitDataViaApi();
        expect(submitResponse.length).toBeGreaterThanOrEqual(2);
        const [firstId, secondId] = submitResponse.map((entry) => entry.sequenceId);
        expect(firstId).toBeDefined();
        expect(secondId).toBeDefined();

        await fakeUnprocessedDataQuery();

        await fakeProcessingPipeline({ sequenceId: firstId, error: true });

        await submitPage.gotoUserPage();
        const countOfNeedsReviewData = await submitPage.page.getByText('NEEDS_REVIEW').count();
        expect(countOfNeedsReviewData).toBeGreaterThanOrEqual(1);

        await fakeProcessingPipeline({ sequenceId: secondId, error: false });
        const countOfProcessedData = await submitPage.page.getByText('PROCESSED', { exact: true }).count();
        expect(countOfProcessedData).toBeGreaterThanOrEqual(1);

        await approveProcessedData(testuser, [secondId]);
        const countOfSiloReadyData = await submitPage.page.getByText('SILO_READY').count();
        expect(countOfSiloReadyData).toBeGreaterThanOrEqual(1);
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
