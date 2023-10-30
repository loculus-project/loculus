import axios, { type AxiosError } from 'axios';

import { type UnprocessedData } from '../../src/types/backend.ts';
import { stringifyMaybeAxiosError } from '../../src/utils/stringifyMaybeAxiosError.ts';
import { backendUrl } from '../e2e.fixture.ts';

const sequenceData = {
    unalignedNucleotideSequences: {
        main: 'A'.repeat(123),
    },
    alignedNucleotideSequences: {
        main: 'A'.repeat(29903),
    },
    nucleotideInsertions: {
        main: ['123:TCTCT', '234:ATATAT'],
    },
    alignedAminoAcidSequences: {
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
} as const;

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
            ...sequenceData,
        },
    };
    try {
        const response = await axios.post(`${backendUrl}/submit-processed-data`, body, {
            headers: {
                'Content-Type': 'application/x-ndjson',
            },
        });

        if (!(response.status === 204)) {
            throw new Error(JSON.stringify(response.data));
        }
    } catch (error) {
        handleError(error);
    }
};

export async function queryUnprocessedData(countOfSequences: number) {
    try {
        const response = await axios.post(
            `${backendUrl}/extract-unprocessed-data?numberOfSequences=${countOfSequences}`,
            undefined,
            {
                headers: {
                    'Content-Type': 'application/x-ndjson',
                },
            },
        );

        if (!(response.status === 200)) {
            throw new Error('Request failed: ' + JSON.stringify(response.data));
        }

        const unprocessedDataAsNdjson = await response.data;
        return unprocessedDataAsNdjson
            .split('\n')
            .filter((line: string) => line.length > 0)
            .map((line: string): UnprocessedData => JSON.parse(line));
    } catch (error) {
        handleError(error);
    }
}

const handleError = (error: unknown) => {
    const axiosError = error as AxiosError;
    if (axiosError.response !== undefined) {
        throw new Error('Error: ' + JSON.stringify(axiosError.response.data));
    } else {
        throw new Error('Unknown error from backend: ' + stringifyMaybeAxiosError(axiosError));
    }
};
