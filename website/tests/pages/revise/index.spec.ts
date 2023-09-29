import { expect, test } from '../../e2e.fixture';

test.describe('The revise page', () => {
    test('should upload files and revise existing data', async ({ revisePage, submitPage, userPage }) => {
        const sequences = await submitPage.prepareDataToBeReleasable();

        await revisePage.goto();
        await expect(revisePage.page.getByText('Result of Revision')).not.toBeVisible();
        await revisePage.submitRevisedData(sequences.map((entry) => entry.sequenceId));
        await expect(revisePage.page.getByText('Result of Revision')).toBeVisible();

        await userPage.gotoUserSequencePage();
        const sequencesToExpect = await userPage.verifyTableEntries([
            ...sequences.map((sequence) => ({
                sequenceId: sequence.sequenceId,
                version: sequence.version + 1,
                status: 'RECEIVED',
            })),
            ...sequences.map((sequence) => ({
                sequenceId: sequence.sequenceId,
                version: sequence.version,
                status: 'SILO_READY',
            })),
        ]);
        expect(sequencesToExpect).toBe(true);
    });
});
