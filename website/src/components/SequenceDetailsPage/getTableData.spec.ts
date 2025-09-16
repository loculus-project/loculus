import { err, Result } from 'neverthrow';
import { beforeEach, describe, expect, test } from 'vitest';

import { getTableData, type GetTableDataResult } from './getTableData.ts';
import { type TableDataEntry } from './types.ts';
import { mockRequest, testConfig, testOrganism } from '../../../vitest.setup.ts';
import { LapisClient } from '../../services/lapisClient.ts';
import type { ProblemDetail } from '../../types/backend.ts';
import type { Schema } from '../../types/config.ts';
import type { MutationProportionCount } from '../../types/lapis.ts';
import { type ReferenceGenomes, SINGLE_REFERENCE } from '../../types/referencesGenomes.ts';

const schema: Schema = {
    organismName: 'instance name',
    metadata: [
        { name: 'metadataField1', type: 'string', header: 'testHeader1' },
        { name: 'metadataField2', type: 'string' },
        { name: 'timestampField', type: 'timestamp', displayName: 'Timestamp field' },
    ],
    tableColumns: [],
    defaultOrderBy: 'metadataField1',
    defaultOrder: 'ascending',
    primaryKey: 'primary key',
    inputFields: [],
    submissionDataTypes: {
        consensusSequences: true,
    },
    suborganismIdentifierField: 'genotype',
};

const singleReferenceGenomes: ReferenceGenomes = {
    [SINGLE_REFERENCE]: {
        nucleotideSequences: [],
        genes: [],
    },
};

const genome1 = 'genome1';
const genome2 = 'genome2';
const multipleReferenceGenomes: ReferenceGenomes = {
    [genome1]: {
        nucleotideSequences: [],
        genes: [],
    },
    [genome2]: {
        nucleotideSequences: [],
        genes: [],
    },
};

const dummyError = {
    error: {
        status: 500,
        type: 'type',
        title: 'title',
        detail: 'error detail',
        instance: 'instance',
    },
};

const info = {
    dataVersion: '1704063600',
};

const accessionVersion = 'accession';

const lapisClient = LapisClient.create(testConfig.serverSide.lapisUrls[testOrganism], schema);

const aminoAcidMutationsHeader = 'Amino acid mutations';
const nucleotideMutationsHeader = 'Nucleotide mutations';

describe('getTableData', () => {
    beforeEach(() => {
        mockRequest.lapis.details(200, { info, data: [toLapisEntry({ dummyField: 'dummyValue' })] });
        mockRequest.lapis.nucleotideMutations(200, { info, data: [] });
        mockRequest.lapis.aminoAcidMutations(200, { info, data: [] });
        mockRequest.lapis.nucleotideInsertions(200, { info, data: [] });
        mockRequest.lapis.aminoAcidInsertions(200, { info, data: [] });
    });

    test('should return an error when getSequenceDetails fails', async () => {
        mockRequest.lapis.details(500, dummyError);

        const result = await getTableData(accessionVersion, schema, singleReferenceGenomes, lapisClient);

        expect(result).toStrictEqual(err(dummyError.error));
    });

    test('should return an error when getSequenceMutations fails', async () => {
        mockRequest.lapis.nucleotideMutations(500, dummyError);

        const result = await getTableData(accessionVersion, schema, singleReferenceGenomes, lapisClient);

        expect(result).toStrictEqual(err(dummyError.error));
    });

    test('should return an error when getSequenceInsertions fails', async () => {
        mockRequest.lapis.nucleotideInsertions(500, dummyError);

        const result = await getTableData(accessionVersion, schema, singleReferenceGenomes, lapisClient);

        expect(result).toStrictEqual(err(dummyError.error));
    });

    test('should return default values when there is no data', async () => {
        const result = await getTableData(accessionVersion, schema, singleReferenceGenomes, lapisClient);

        const data = result._unsafeUnwrap().data;
        expect(data).toStrictEqual(defaultMutationsInsertionsDeletionsList);
    });

    test('should return details field values', async () => {
        const value1 = 'value 1';
        const value2 = 'value 2';

        mockRequest.lapis.details(200, {
            info,
            data: [
                {
                    metadataField1: value1,
                    metadataField2: value2,
                },
            ].map((d) => toLapisEntry(d)),
        });

        const result = await getTableData('accession', schema, singleReferenceGenomes, lapisClient);

        const data = result._unsafeUnwrap().data;
        expect(data).toContainEqual({
            label: 'Metadata field1',
            name: 'metadataField1',
            value: value1,
            header: 'testHeader1',
            type: { kind: 'metadata', metadataType: 'string' },
        });
        expect(data).toContainEqual({
            label: 'Metadata field2',
            name: 'metadataField2',
            value: value2,
            header: '',
            type: { kind: 'metadata', metadataType: 'string' },
        });
    });

    test('should return data of mutations', async () => {
        mockRequest.lapis.nucleotideMutations(200, { info, data: nucleotideMutations });
        mockRequest.lapis.aminoAcidMutations(200, { info, data: aminoAcidMutations });

        const result = await getTableData('accession', schema, singleReferenceGenomes, lapisClient);

        expectMutationDataMatches(result);
    });

    test('should return data of mutations for multi pathogen organism', async () => {
        mockRequest.lapis.details(200, { info, data: [{ genotype: genome1 }] });
        mockRequest.lapis.nucleotideMutations(200, { info, data: multiPathogenNucleotideMutations });
        mockRequest.lapis.aminoAcidMutations(200, { info, data: multiPathogenAminoAcidMutations });

        const result = await getTableData('accession', schema, multipleReferenceGenomes, lapisClient);

        expectMutationDataMatches(result);
    });

    function expectMutationDataMatches(result: Result<GetTableDataResult, ProblemDetail>) {
        const data = result._unsafeUnwrap().data;
        expect(data).toContainEqual({
            label: 'Substitutions',
            name: 'nucleotideSubstitutions',
            value: '',
            header: nucleotideMutationsHeader,
            customDisplay: {
                type: 'badge',
                value: [
                    {
                        segment: '',
                        mutations: [
                            {
                                mutationFrom: 'T',
                                mutationTo: 'A',
                                position: 10,
                                sequenceName: null,
                            },
                            {
                                mutationFrom: 'C',
                                mutationTo: 'G',
                                position: 30,
                                sequenceName: null,
                            },
                        ],
                    },
                ],
            },
            type: { kind: 'mutation' },
        });
        expect(data).toContainEqual({
            label: 'Deletions',
            name: 'nucleotideDeletions',
            value: '20, 21, 39-45, 400',
            header: nucleotideMutationsHeader,
            type: { kind: 'mutation' },
        });
        expect(data).toContainEqual({
            label: 'Substitutions',
            name: 'aminoAcidSubstitutions',
            value: '',
            header: aminoAcidMutationsHeader,
            customDisplay: {
                type: 'badge',
                value: [
                    {
                        segment: 'gene1',
                        mutations: [
                            {
                                mutationFrom: 'N',
                                mutationTo: 'Y',
                                position: 10,
                                sequenceName: 'gene1',
                            },
                            {
                                mutationFrom: 'T',
                                mutationTo: 'N',
                                position: 30,
                                sequenceName: 'gene1',
                            },
                        ],
                    },
                ],
            },
            type: { kind: 'mutation' },
        });
        expect(data).toContainEqual({
            label: 'Deletions',
            name: 'aminoAcidDeletions',
            value: 'gene1:20-23, gene1:40',
            header: aminoAcidMutationsHeader,
            type: { kind: 'mutation' },
        });
    }

    test('should return data of insertions', async () => {
        mockRequest.lapis.nucleotideInsertions(200, { info, data: nucleotideInsertions });
        mockRequest.lapis.aminoAcidInsertions(200, { info, data: aminoAcidInsertions });

        const result = await getTableData('accession', schema, singleReferenceGenomes, lapisClient);
        expectInsertionsMatch(result);
    });

    test('should return data of insertions for multi pathogen', async () => {
        mockRequest.lapis.details(200, { info, data: [{ genotype: genome1 }] });
        mockRequest.lapis.nucleotideInsertions(200, { info, data: multiPathogenNucleotideInsertions });
        mockRequest.lapis.aminoAcidInsertions(200, { info, data: multiPathogenAminoAcidInsertions });

        const result = await getTableData('accession', schema, multipleReferenceGenomes, lapisClient);
        expectInsertionsMatch(result);
    });

    function expectInsertionsMatch(result: Result<GetTableDataResult, ProblemDetail>) {
        const data = result._unsafeUnwrap().data;
        expect(data).toContainEqual({
            label: 'Insertions',
            name: 'nucleotideInsertions',
            value: 'ins_123:AAA, ins_456:GCT',
            header: nucleotideMutationsHeader,
            type: { kind: 'mutation' },
        });
        expect(data).toContainEqual({
            label: 'Insertions',
            name: 'aminoAcidInsertions',
            value: 'ins_gene1:123:AAA, ins_gene1:456:TTT',
            header: aminoAcidMutationsHeader,
            type: { kind: 'mutation' },
        });
    }

    test('should map timestamps to human readable dates', async () => {
        mockRequest.lapis.details(200, { info, data: [{ timestampField: 1706194761 }] });

        const result = await getTableData('accession', schema, singleReferenceGenomes, lapisClient);

        const data = result._unsafeUnwrap().data;
        expect(data).toContainEqual({
            label: 'Timestamp field',
            name: 'timestampField',
            value: '2024-01-25 14:59:21 UTC',
            header: '',
            type: { kind: 'metadata', metadataType: 'timestamp' },
        });
    });

    test('should correctly determine revocation entry', async () => {
        for (const expectedIsRevocation of [true, false]) {
            mockRequest.lapis.details(200, {
                info,
                data: [toLapisEntry({}, expectedIsRevocation)],
            });
            const result = await getTableData('accession', schema, singleReferenceGenomes, lapisClient);
            const isRevocation = result._unsafeUnwrap().isRevocation;
            expect(isRevocation).toBe(expectedIsRevocation);
        }
    });

    test('should not return mutation data when allowSubmissionOfConsensusSequences = false', async () => {
        mockRequest.lapis.nucleotideMutations(200, { info, data: nucleotideMutations });
        mockRequest.lapis.aminoAcidMutations(200, { info, data: aminoAcidMutations });
        mockRequest.lapis.details(200, { info, data: [{ timestampField: 1706194761 }] });

        const result = await getTableData(
            accessionVersion,
            {
                ...schema,
                submissionDataTypes: {
                    consensusSequences: false,
                },
            },
            singleReferenceGenomes,
            lapisClient,
        );

        const data = result._unsafeUnwrap().data;

        const mutationTableEntries = data.filter((entry) =>
            [nucleotideMutationsHeader, aminoAcidMutationsHeader].includes(entry.header),
        );

        expect(data.length).greaterThanOrEqual(1, 'data.length');
        expect(mutationTableEntries).toStrictEqual([]);
    });

    test('should return the suborganism name for a single reference genome', async () => {
        const result = await getTableData(accessionVersion, schema, singleReferenceGenomes, lapisClient);

        const suborganism = result._unsafeUnwrap().suborganism;

        expect(suborganism).equals(SINGLE_REFERENCE);
    });

    test('should return the suborganism name for multiple reference genomes', async () => {
        mockRequest.lapis.details(200, { info, data: [{ genotype: genome2 }] });

        const result = await getTableData(accessionVersion, schema, multipleReferenceGenomes, lapisClient);

        const suborganism = result._unsafeUnwrap().suborganism;

        expect(suborganism).equals(genome2);
    });

    test('should throw when the suborganism name is not in multiple reference genomes', async () => {
        mockRequest.lapis.details(200, { info, data: [{ genotype: 5 }] });

        const result = await getTableData(accessionVersion, schema, multipleReferenceGenomes, lapisClient);

        expect(result).toStrictEqual(
            err({
                detail: "Value '5' of field 'genotype' is not a valid string.",
                instance: '/seq/' + accessionVersion,
                status: 0,
                title: 'Invalid suborganism field',
                type: 'about:blank',
            }),
        );
    });

    test('should throw when the suborganism name is not in multiple reference genomes', async () => {
        mockRequest.lapis.details(200, { info, data: [{ genotype: 'unknown suborganism' }] });

        const result = await getTableData(accessionVersion, schema, multipleReferenceGenomes, lapisClient);

        expect(result).toStrictEqual(
            err({
                detail: "Suborganism 'unknown suborganism' (value of field 'genotype') not found in reference genomes.",
                instance: '/seq/' + accessionVersion,
                status: 0,
                title: 'Invalid suborganism',
                type: 'about:blank',
            }),
        );
    });
});

function toLapisEntry(entry: Record<string, unknown>, isRevocation = false) {
    return {
        ...entry,
        isRevocation,
    };
}

const nucleotideMutations: MutationProportionCount[] = [
    {
        count: 0,
        proportion: 0,
        mutation: 'T10A',
        mutationFrom: 'T',
        mutationTo: 'A',
        position: 10,
        sequenceName: null,
    },
    {
        count: 0,
        proportion: 0,
        mutation: 'A20-',
        mutationFrom: 'A',
        mutationTo: '-',
        position: 20,
        sequenceName: null,
    },
    {
        count: 0,
        proportion: 0,
        mutation: 'A21-',
        mutationFrom: 'A',
        mutationTo: '-',
        position: 21,
        sequenceName: null,
    },
    {
        count: 0,
        proportion: 0,
        mutation: 'C30G',
        mutationFrom: 'C',
        mutationTo: 'G',
        position: 30,
        sequenceName: null,
    },
    {
        count: 0,
        proportion: 0,
        mutation: 'G40-',
        mutationFrom: 'G',
        mutationTo: '-',
        position: 40,
        sequenceName: null,
    },
    {
        count: 0,
        proportion: 0,
        mutation: 'C41-',
        mutationFrom: 'C',
        mutationTo: '-',
        position: 41,
        sequenceName: null,
    },
    {
        count: 0,
        proportion: 0,
        mutation: 'T42-',
        mutationFrom: 'T',
        mutationTo: '-',
        position: 42,
        sequenceName: null,
    },
    {
        count: 0,
        proportion: 0,
        mutation: 'T39-',
        mutationFrom: 'T',
        mutationTo: '-',
        position: 39,
        sequenceName: null,
    },
    {
        count: 0,
        proportion: 0,
        mutation: 'T43-',
        mutationFrom: 'T',
        mutationTo: '-',
        position: 43,
        sequenceName: null,
    },
    {
        count: 0,
        proportion: 0,
        mutation: 'T44-',
        mutationFrom: 'T',
        mutationTo: '-',
        position: 44,
        sequenceName: null,
    },
    {
        count: 0,
        proportion: 0,
        mutation: 'T45-',
        mutationFrom: 'T',
        mutationTo: '-',
        position: 45,
        sequenceName: null,
    },
    {
        count: 0,
        proportion: 0,
        mutation: 'T400-',
        mutationFrom: 'T',
        mutationTo: '-',
        position: 400,
        sequenceName: null,
    },
];

const multiPathogenNucleotideMutations: MutationProportionCount[] = [
    {
        count: 0,
        proportion: 0,
        mutation: `${genome1}:T10A`,
        mutationFrom: 'T',
        mutationTo: 'A',
        position: 10,
        sequenceName: genome1,
    },
    {
        count: 0,
        proportion: 0,
        mutation: `${genome1}:A20-`,
        mutationFrom: 'A',
        mutationTo: '-',
        position: 20,
        sequenceName: genome1,
    },
    {
        count: 0,
        proportion: 0,
        mutation: `${genome1}:A21-`,
        mutationFrom: 'A',
        mutationTo: '-',
        position: 21,
        sequenceName: genome1,
    },
    {
        count: 0,
        proportion: 0,
        mutation: `${genome1}:C30G`,
        mutationFrom: 'C',
        mutationTo: 'G',
        position: 30,
        sequenceName: genome1,
    },
    {
        count: 0,
        proportion: 0,
        mutation: `${genome1}:G40-`,
        mutationFrom: 'G',
        mutationTo: '-',
        position: 40,
        sequenceName: genome1,
    },
    {
        count: 0,
        proportion: 0,
        mutation: `${genome1}:C41-`,
        mutationFrom: 'C',
        mutationTo: '-',
        position: 41,
        sequenceName: genome1,
    },
    {
        count: 0,
        proportion: 0,
        mutation: `${genome1}:T42-`,
        mutationFrom: 'T',
        mutationTo: '-',
        position: 42,
        sequenceName: genome1,
    },
    {
        count: 0,
        proportion: 0,
        mutation: `${genome1}:T39-`,
        mutationFrom: 'T',
        mutationTo: '-',
        position: 39,
        sequenceName: genome1,
    },
    {
        count: 0,
        proportion: 0,
        mutation: `${genome1}:T43-`,
        mutationFrom: 'T',
        mutationTo: '-',
        position: 43,
        sequenceName: genome1,
    },
    {
        count: 0,
        proportion: 0,
        mutation: `${genome1}:T44-`,
        mutationFrom: 'T',
        mutationTo: '-',
        position: 44,
        sequenceName: genome1,
    },
    {
        count: 0,
        proportion: 0,
        mutation: `${genome1}:T45-`,
        mutationFrom: 'T',
        mutationTo: '-',
        position: 45,
        sequenceName: genome1,
    },
    {
        count: 0,
        proportion: 0,
        mutation: `${genome1}:T400-`,
        mutationFrom: 'T',
        mutationTo: '-',
        position: 400,
        sequenceName: genome1,
    },
];

const aminoAcidMutations: MutationProportionCount[] = [
    {
        count: 0,
        proportion: 0,
        mutation: 'gene1:N10Y',
        mutationFrom: 'N',
        mutationTo: 'Y',
        position: 10,
        sequenceName: 'gene1',
    },
    {
        count: 0,
        proportion: 0,
        mutation: 'gene1:R20-',
        mutationFrom: 'R',
        mutationTo: '-',
        position: 20,
        sequenceName: 'gene1',
    },
    {
        count: 0,
        proportion: 0,
        mutation: 'gene1:R21-',
        mutationFrom: 'R',
        mutationTo: '-',
        position: 21,
        sequenceName: 'gene1',
    },
    {
        count: 0,
        proportion: 0,
        mutation: 'gene1:N22-',
        mutationFrom: 'N',
        mutationTo: '-',
        position: 22,
        sequenceName: 'gene1',
    },
    {
        count: 0,
        proportion: 0,
        mutation: 'gene1:P23-',
        mutationFrom: 'P',
        mutationTo: '-',
        position: 23,
        sequenceName: 'gene1',
    },
    {
        count: 0,
        proportion: 0,
        mutation: 'gene1:T30N',
        mutationFrom: 'T',
        mutationTo: 'N',
        position: 30,
        sequenceName: 'gene1',
    },
    {
        count: 0,
        proportion: 0,
        mutation: 'gene1:F40-',
        mutationFrom: 'F',
        mutationTo: '-',
        position: 40,
        sequenceName: 'gene1',
    },
];

const multiPathogenAminoAcidMutations: MutationProportionCount[] = [
    {
        count: 0,
        proportion: 0,
        mutation: `${genome1}-gene1:N10Y`,
        mutationFrom: 'N',
        mutationTo: 'Y',
        position: 10,
        sequenceName: `${genome1}-gene1`,
    },
    {
        count: 0,
        proportion: 0,
        mutation: `${genome1}-gene1:R20-`,
        mutationFrom: 'R',
        mutationTo: '-',
        position: 20,
        sequenceName: `${genome1}-gene1`,
    },
    {
        count: 0,
        proportion: 0,
        mutation: `${genome1}-gene1:R21-`,
        mutationFrom: 'R',
        mutationTo: '-',
        position: 21,
        sequenceName: `${genome1}-gene1`,
    },
    {
        count: 0,
        proportion: 0,
        mutation: `${genome1}-gene1:N22-`,
        mutationFrom: 'N',
        mutationTo: '-',
        position: 22,
        sequenceName: `${genome1}-gene1`,
    },
    {
        count: 0,
        proportion: 0,
        mutation: `${genome1}-gene1:P23-`,
        mutationFrom: 'P',
        mutationTo: '-',
        position: 23,
        sequenceName: `${genome1}-gene1`,
    },
    {
        count: 0,
        proportion: 0,
        mutation: `${genome1}-gene1:T30N`,
        mutationFrom: 'T',
        mutationTo: 'N',
        position: 30,
        sequenceName: `${genome1}-gene1`,
    },
    {
        count: 0,
        proportion: 0,
        mutation: `${genome1}-gene1:F40-`,
        mutationFrom: 'F',
        mutationTo: '-',
        position: 40,
        sequenceName: `${genome1}-gene1`,
    },
];

const nucleotideInsertions = [
    { count: 0, insertion: 'ins_123:AAA', insertedSymbols: 'AAA', position: 123, sequenceName: null },
    { count: 0, insertion: 'ins_456:GCT', insertedSymbols: 'GCT', position: 456, sequenceName: null },
];
const multiPathogenNucleotideInsertions = [
    { count: 0, insertion: `ins_${genome1}:123:AAA`, insertedSymbols: 'AAA', position: 123, sequenceName: genome1 },
    { count: 0, insertion: `ins_${genome1}:456:GCT`, insertedSymbols: 'GCT', position: 456, sequenceName: genome1 },
];
const aminoAcidInsertions = [
    { count: 0, insertion: 'ins_gene1:123:AAA', insertedSymbols: 'AAA', position: 123, sequenceName: 'gene1' },
    { count: 0, insertion: 'ins_gene1:456:TTT', insertedSymbols: 'TTT', position: 456, sequenceName: 'gene1' },
];
const multiPathogenAminoAcidInsertions = [
    {
        count: 0,
        insertion: `ins_${genome1}-gene1:123:AAA`,
        insertedSymbols: 'AAA',
        position: 123,
        sequenceName: `${genome1}-gene1`,
    },
    {
        count: 0,
        insertion: `ins_${genome1}-gene1:456:TTT`,
        insertedSymbols: 'TTT',
        position: 456,
        sequenceName: `${genome1}-gene1`,
    },
];

const defaultMutationsInsertionsDeletionsList: TableDataEntry[] = [
    {
        label: 'Substitutions',
        name: 'nucleotideSubstitutions',
        value: '',
        header: nucleotideMutationsHeader,
        customDisplay: {
            type: 'badge',
            value: [],
        },
        type: { kind: 'mutation' },
    },
    {
        label: 'Deletions',
        name: 'nucleotideDeletions',
        value: '',
        header: nucleotideMutationsHeader,
        type: { kind: 'mutation' },
    },
    {
        label: 'Insertions',
        name: 'nucleotideInsertions',
        value: '',
        header: nucleotideMutationsHeader,
        type: { kind: 'mutation' },
    },
    {
        label: 'Substitutions',
        name: 'aminoAcidSubstitutions',
        value: '',
        header: aminoAcidMutationsHeader,
        customDisplay: {
            type: 'badge',
            value: [],
        },
        type: { kind: 'mutation' },
    },
    {
        label: 'Deletions',
        name: 'aminoAcidDeletions',
        value: '',
        header: aminoAcidMutationsHeader,
        type: { kind: 'mutation' },
    },
    {
        label: 'Insertions',
        name: 'aminoAcidInsertions',
        value: '',
        header: aminoAcidMutationsHeader,
        type: { kind: 'mutation' },
    },
];
