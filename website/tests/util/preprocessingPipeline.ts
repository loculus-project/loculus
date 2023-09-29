import { backendUrl } from '../e2e.fixture.ts';

export const fakeProcessingPipeline = async ({
    sequenceId,
    version,
    error,
}: {
    sequenceId: number;
    version: number;
    error: boolean;
}) => {
    const body = {
        sequenceId,
        version,
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

    const response = await fetch(`${backendUrl}/submit-processed-data`, {
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

export async function queryUnprocessedData(countOfSequences: number) {
    const response = await fetch(`${backendUrl}/extract-unprocessed-data?numberOfSequences=${countOfSequences}`, {
        method: 'POST',
    });

    if (!response.ok) {
        throw new Error(`Unexpected response: ${response.statusText}`);
    }

    const unprocessedDataAsNdjson = (await response.text()) as string;
    return unprocessedDataAsNdjson
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line): Sequence => JSON.parse(line));
}

export type Sequence = {
    sequenceId: number;
    version: number;
    data: any;
    errors?: any[];
    warnings?: any[];
};
