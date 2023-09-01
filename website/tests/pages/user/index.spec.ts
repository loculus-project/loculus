import { expect, test } from '../../e2e.fixture';

test.describe('The user page', () => {
    test('should show sequences, their status and a link to reviews', async ({ submitPage }) => {
        await submitPage.submit();
        await submitPage.gotoUserPage();

        await fakeProcessingPipeline();

        const resultCount = await submitPage.page.getByText('NEEDS_REVIEW').count();
        expect(resultCount).toBeGreaterThanOrEqual(1);

        await submitPage.page.getByText('Processing Error - Click to view').click();
        await expect(submitPage.page.getByText('Not this kind of host')).toBeVisible();
    });
});

const fakeProcessingPipeline = async () => {
    const response = await fetch('http://localhost:8079/submit-processed-data', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-ndjson',
        },
        body: JSON.stringify({
            sequenceId: 1,
            processing_errors: [{ source: { fieldName: 'host', type: 'metadata' }, message: 'Not this kind of host' }],
            processing_warnings: [
                { source: { fieldName: 'all', type: 'all' }, message: '"There is no warning"-warning' },
            ],
            data: {
                metadata: {
                    date: '2002-12-15',
                    host: 'google.com',
                    region: 'Europe',
                    country: 'Spain',
                    division: 'Schaffhausen',
                },
                unalignedNucleotideSequences: { main: 'NNNNNNNNNNNNNNNN' },
            },
        }),
    });
    if (!response.ok) {
        throw new Error(`Unexpected response: ${response.statusText}`);
    }
};
