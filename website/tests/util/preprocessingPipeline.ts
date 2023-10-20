import type { UnprocessedData } from '../../src/types.ts';
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
        errors: error ? [{ source: [{ name: 'host', type: 'Metadata' }], message: 'Not this kind of host' }] : [],
        warnings: [{ source: [{ name: 'date', type: 'Metadata' }], message: '"There is no warning"-warning' }],
        data: {
            metadata: {
                date: '2002-12-15',
                host: 'google.com',
                region: 'Europe',
                country: 'Spain',
                division: 'Schaffhausen',
            },
            unalignedNucleotideSequences: {
                main: 'A'.repeat(123),
            },
            alignedNucleotideSequences: {
                main: 'A'.repeat(29903),
            },
            nucleotideInsertions: {
                main: ['123:TCTCT', '234:ATATAT'],
            },
            aminoAcidSequences: {
                E: 'M'.repeat(76),
                M: 'A'.repeat(223),
                N: 'S'.repeat(420),
                ORF1a: 'E'.repeat(4401),
                ORF1b: 'R'.repeat(2696),
                ORF3a: 'D'.repeat(276),
                ORF6: 'F'.repeat(62),
                ORF7a: 'K'.repeat(122),
                ORF7b: 'I'.repeat(44),
                ORF8: 'L'.repeat(122),
                ORF9b: 'P'.repeat(98),
                S: 'V'.repeat(1274),
            },
            aminoAcidInsertions: {
                S: ['123:NRNR'],
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
        const body = await response.text();
        throw new Error(`Unexpected response with status '${response.statusText}': ${body}`);
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
        .map((line): UnprocessedData => JSON.parse(line));
}
