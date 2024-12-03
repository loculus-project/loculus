import type { AxiosError } from 'axios';

import { BackendClient } from '../../src/services/backendClient.ts';
import { type Accession, unprocessedData, type UnprocessedData } from '../../src/types/backend.ts';
import { stringifyMaybeAxiosError } from '../../src/utils/stringifyMaybeAxiosError.ts';
import { backendUrl, dummyOrganism, e2eLogger, getToken, testSequenceEntryData } from '../e2e.fixture.ts';

export const fakeProcessingPipeline = {
    submit,
    query,
};

export type PreprocessingOptions = {
    accession: Accession;
    version: number;
    error: boolean;
};

async function submit(preprocessingOptions: PreprocessingOptions[]) {
    const body = preprocessingOptions
        .map(({ accession, version, error }) => {
            return {
                accession,
                version,
                errors: error
                    ? [
                          {
                              unprocessedFields: [{ name: 'host', type: 'Metadata' }],
                              processedFields: [{ name: 'host', type: 'Metadata' }],
                              message: 'Not this kind of host',
                          },
                      ]
                    : [],
                warnings: [
                    {
                        unprocessedFields: [{ name: 'date', type: 'Metadata' }],
                        processedFields: [{ name: 'date', type: 'Metadata' }],
                        message: '"There is no warning"-warning',
                    },
                ],
                data: {
                    metadata: {
                        date: '2002-12-15',
                        host: 'google.com',
                        region: 'Europe',
                        country: 'Switzerland',
                        division: 'Schaffhausen',
                        pangoLineage: 'B.1.1.7',
                    },
                    ...sequenceData,
                },
            };
        })
        .map((data) => JSON.stringify(data))
        .join('\n');

    const jwt = await getJwtTokenForPreprocessingPipeline();

    const response = await BackendClient.create(backendUrl, e2eLogger).call('submitProcessedData', body, {
        params: { organism: dummyOrganism.key },
        queries: { pipelineVersion: 1 },
        headers: { 'Content-Type': 'application/x-ndjson', 'Authorization': `Bearer ${jwt}` },
    });

    if (response.isErr()) {
        throw handleError(response.error);
    }
}

async function getJwtTokenForPreprocessingPipeline(
    username: string = 'preprocessing_pipeline',
    password: string = 'preprocessing_pipeline',
): Promise<string> {
    const token = await getToken(username, password);

    return token.accessToken;
}

async function query(numberOfSequenceEntries: number): Promise<UnprocessedData[]> {
    const jwt = await getJwtTokenForPreprocessingPipeline();

    const response = await BackendClient.create(backendUrl, e2eLogger).call('extractUnprocessedData', undefined, {
        params: { organism: dummyOrganism.key },
        queries: { numberOfSequenceEntries, pipelineVersion: 1 },
        headers: { Authorization: `Bearer ${jwt}` },
    });

    return response.match(
        (unprocessedDataAsNdjson) => {
            // When only getting 1 sequence, the backend returns an object instead of a string
            if (typeof unprocessedDataAsNdjson === 'object') {
                return [unprocessedData.parse(unprocessedDataAsNdjson)];
            }

            return unprocessedDataAsNdjson
                .split('\n')
                .filter((line) => line.length > 0)
                .map((line) => {
                    try {
                        return unprocessedData.parse(JSON.parse(line));
                    } catch (error) {
                        if (error instanceof SyntaxError) {
                            throw new Error(
                                'Invalid JSON syntax error: ' +
                                    error.message +
                                    ' for response:\n ' +
                                    unprocessedDataAsNdjson,
                            );
                        }
                        throw error;
                    }
                });
        },
        (error) => {
            throw handleError(error);
        },
    );
}

const handleError = (error: unknown): Error => {
    const axiosError = error as AxiosError;
    if (axiosError.response !== undefined) {
        return new Error('Error: ' + JSON.stringify(axiosError.response.data));
    } else {
        return new Error('Unknown error from backend: ' + stringifyMaybeAxiosError(axiosError));
    }
};

const sequenceData = {
    unalignedNucleotideSequences: {
        main: testSequenceEntryData.unaligned,
    },
    alignedNucleotideSequences: {
        main: 'N' + 'A'.repeat(29902),
    },
    nucleotideInsertions: {
        main: ['123:TCTCT', '234:ATATAT'],
    },
    alignedAminoAcidSequences: {
        E: 'M'.repeat(76),
        M: 'A'.repeat(223),
        N: 'S'.repeat(420),
        ORF1a: testSequenceEntryData.orf1a + 'E'.repeat(4401 - testSequenceEntryData.orf1a.length),
        ORF1b: 'R'.repeat(2696),
        ORF3a: 'D'.repeat(276),
        ORF6: 'F'.repeat(62),
        ORF7a: 'K'.repeat(122),
        ORF7b: 'I'.repeat(44),
        ORF8: 'L'.repeat(122),
        ORF9b: null,
        S: 'V'.repeat(1274),
    },
    aminoAcidInsertions: {
        S: ['123:NRNR'],
    },
} as const;
