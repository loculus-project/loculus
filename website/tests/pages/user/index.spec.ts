import { expect, test, testuser } from '../../e2e.fixture';
import { fakeProcessingPipeline, queryUnprocessedData } from '../../util/preprocessingPipeline';

test.describe('The user page', () => {
    test('should show sequences, their status and a link to reviews', async ({ submitPage, userPage }) => {
        test.slow();
        await submitPage.goto();
        await submitPage.submit();

        const sequences = await queryUnprocessedData(submitPage.getTestSequenceCount());
        expect(sequences.length).toBe(submitPage.getTestSequenceCount());
        const [firstSequence, secondSequence] = sequences;

        await fakeProcessingPipeline({
            sequenceId: firstSequence.sequenceId,
            version: firstSequence.version,
            error: true,
        });
        await userPage.gotoUserSequencePage();
        const sequenceNeedingReviewIsPresent = await userPage.verifyTableEntries([
            {
                sequenceId: firstSequence.sequenceId,
                version: firstSequence.version,
                status: 'NEEDS_REVIEW',
                isRevocation: false,
            },
        ]);
        expect(sequenceNeedingReviewIsPresent).toBe(true);

        await fakeProcessingPipeline({
            sequenceId: secondSequence.sequenceId,
            version: secondSequence.version,
            error: false,
        });
        await userPage.gotoUserSequencePage();
        const sequenceThatIsProcessedIsPresent = await userPage.verifyTableEntries([
            {
                sequenceId: secondSequence.sequenceId,
                version: secondSequence.version,
                status: 'PROCESSED',
                isRevocation: false,
            },
        ]);
        expect(sequenceThatIsProcessedIsPresent).toBe(true);

        await submitPage.approveProcessedData(testuser, [secondSequence]);
        await userPage.gotoUserSequencePage();
        const sequenceThatIsReleasableIsPresent = await userPage.verifyTableEntries([
            {
                sequenceId: secondSequence.sequenceId,
                version: secondSequence.version,
                status: 'SILO_READY',
                isRevocation: false,
            },
        ]);
        expect(sequenceThatIsReleasableIsPresent).toBe(true);
    });
});
