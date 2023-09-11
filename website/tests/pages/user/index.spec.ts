import { expect, test, testuser } from '../../e2e.fixture';

test.describe('The user page', () => {
    test('should show sequences, their status and a link to reviews', async ({ submitPage }) => {
        const submitResponse = await submitPage.submitDataViaApi();
        expect(submitResponse.length).toBeGreaterThanOrEqual(2);
        const [firstId, secondId] = submitResponse.map((entry) => entry.sequenceId);
        expect(firstId).toBeDefined();
        expect(secondId).toBeDefined();

        await fakeProcessingPipeline({ sequenceId: firstId, error: true });

        await submitPage.gotoUserPage();
        await expect(await submitPage.page.getByText('NEEDS_REVIEW').count()).toBeGreaterThanOrEqual(1);

        await fakeProcessingPipeline({ sequenceId: secondId, error: false });
        const countOfProcessedData = await submitPage.page.getByText('PROCESSED', { exact: true }).count();
        await expect(countOfProcessedData).toBeGreaterThanOrEqual(1);

        await approveProcessedData([secondId]);
        await expect(await submitPage.page.getByText('SILO_READY').count()).toBeGreaterThanOrEqual(1);

        // TODO: As there are 3 parallel tests for each browser, there are more than one link. Should correlate with sequenceId to get a unique result here
        // await submitPage.page.getByText('Processing Error - Click to view').click();
        // await expect(submitPage.page.getByText('Not this kind of host')).toBeVisible();
    });
});

const fakeProcessingPipeline = async ({ sequenceId, error }: { sequenceId: number; error: boolean }) => {
    const body = {
        sequenceId,
        errors: error ? [{ source: { fieldName: 'host', type: 'metadata' }, message: 'Not this kind of host' }] : [],
        warnings: [{ source: { fieldName: 'all', type: 'all' }, message: '"There is no warning"-warning' }],
        data: {
            metadata: {
                date: '2002-12-15',
                host: 'google.com',
                region: 'Europe',
                country: 'Spain',
                division: 'Schaffhausen',
            },
            unalignedNucleotideSequences: {
                main: 'AATTCC...',
            },
            alignedNucleotideSequences: {
                main: 'NNNNNAATTCC...',
            },
            nucleotideInsertions: {
                insertions: [],
            },
            alignedAminoAcidSequences: {
                S: 'XXMSR...',
                ORF1a: '...',
            },
            aminoAcidInsertions: {
                S: [],
            },
        },
    };

    const response = await fetch('http://localhost:8079/submit-processed-data', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-ndjson',
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`Unexpected response: ${response.statusText}`);
    }
};

const approveProcessedData = async (sequenceIds: number[]): Promise<void> => {
    const body = JSON.stringify({
        sequenceIds,
    });
    const response = await fetch(`http://localhost:8079/approve-processed-data?username=${testuser}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body,
    });
    if (!response.ok) {
        throw new Error(`Unexpected response: ${response.statusText}`);
    }
};
