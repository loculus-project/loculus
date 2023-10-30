import { expect, test } from '../../e2e.fixture';
import type { SequenceStatus } from '../../../src/types/backend.ts';

test.describe('The revise page', () => {
    test('should upload files and revise existing data', async ({ revisePage, submitPage, userPage }) => {
        const sequences = await submitPage.prepareDataToBeReleasable();

        await revisePage.goto();
        await expect(revisePage.page.getByText('Result of Revision')).not.toBeVisible();
        await revisePage.submitRevisedData(sequences.map((entry) => entry.sequenceId));
        await expect(revisePage.page.getByText('Result of Revision')).toBeVisible();

        await userPage.gotoUserSequencePage();
        const newSequences = sequences.map(
            (sequence): SequenceStatus => ({
                sequenceId: sequence.sequenceId,
                version: sequence.version + 1,
                status: 'RECEIVED',
                isRevocation: false,
            }),
        );

        const oldSequences = sequences.map(
            (sequence): SequenceStatus => ({
                sequenceId: sequence.sequenceId,
                version: sequence.version,
                status: 'SILO_READY',
                isRevocation: false,
            }),
        );

        const sequencesToExpect = await userPage.verifyTableEntries([...newSequences, ...oldSequences]);
        expect(sequencesToExpect).toBe(true);
    });
});
