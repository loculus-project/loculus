import { test } from '../e2e.fixture';
import { fakeProcessingPipeline } from '../util/preprocessingPipeline';

// Currently this is not really a test, but a setup for manual testing/demonstration purposes
test.describe('Setup', () => {
    test('should process all data except one', async ({ submitPage }) => {
        const submitResponse = await submitPage.submitDataViaApi();
        const sequenceIds = submitResponse.map((entry) => entry.sequenceId);

        sequenceIds.map((sequenceId) =>
            fakeProcessingPipeline({ sequenceId, error: sequenceId % 10 === 0 ? true : false }),
        );
    });
});
