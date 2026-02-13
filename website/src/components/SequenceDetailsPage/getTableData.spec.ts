import { err, Result } from 'neverthrow';
import { beforeEach, describe, expect, test } from 'vitest';

import { getTableData, type GetTableDataResult } from './getTableData.ts';
import { type TableDataEntry } from './types.ts';
import { mockRequest, testConfig, testOrganism } from '../../../vitest.setup.ts';
import { LapisClient } from '../../services/lapisClient.ts';
import type { ProblemDetail } from '../../types/backend.ts';
import type { Schema } from '../../types/config.ts';
import type { MutationProportionCount } from '../../types/lapis.ts';
import {
    MULTI_SEG_MULTI_REF_REFERENCEGENOMES,
    SINGLE_SEG_MULTI_REF_REFERENCEGENOMES,
    SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
} from '../../types/referenceGenomes.spec.ts';

const schema: Schema = {
    organismName: 'instance name',
    metadata: [
        { name: 'metadataField1', type: 'string', header: 'testHeader1' },
        { name: 'metadataField2', type: 'string' },
        { name: 'timestampField', type: 'timestamp', displayName: 'Timestamp field' },
        { name: 'genotype', type: 'string' },
    ],
    tableColumns: [],
    defaultOrderBy: 'metadataField1',
    defaultOrder: 'ascending',
    primaryKey: 'primary key',
    inputFields: [],
    submissionDataTypes: {
        consensusSequences: true,
    },
    referenceIdentifierField: 'genotype',
};

const genome1 = 'ref1';
const genome2 = 'ref2';

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

        const result = await getTableData(
            accessionVersion,
            schema,
            SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
            lapisClient,
        );

        expect(result).toStrictEqual(err(dummyError.error));
    });

    test('should return an error when getSequenceMutations fails', async () => {
        mockRequest.lapis.nucleotideMutations(500, dummyError);

        const result = await getTableData(
            accessionVersion,
            schema,
            SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
            lapisClient,
        );

        expect(result).toStrictEqual(err(dummyError.error));
    });

    test('should return an error when getSequenceInsertions fails', async () => {
        mockRequest.lapis.nucleotideInsertions(500, dummyError);

        const result = await getTableData(
            accessionVersion,
            schema,
            SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
            lapisClient,
        );

        expect(result).toStrictEqual(err(dummyError.error));
    });

    test('should return default values when there is no data', async () => {
        const result = await getTableData(
            accessionVersion,
            schema,
            SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
            lapisClient,
        );

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

        const result = await getTableData('accession', schema, SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES, lapisClient);

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

        const result = await getTableData('accession', schema, SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES, lapisClient);

        expectMutationDataMatches(result);
    });

    test('should return data of mutations for single segment multi reference organism', async () => {
        mockRequest.lapis.details(200, { info, data: [{ genotype: genome1 }] });
        mockRequest.lapis.nucleotideMutations(200, { info, data: singleSegMultiRefNucleotideMutations });
        mockRequest.lapis.aminoAcidMutations(200, { info, data: singleSegMultiRefAminoAcidMutations });

        const result = await getTableData('accession', schema, SINGLE_SEG_MULTI_REF_REFERENCEGENOMES, lapisClient);

        expectMutationDataMatches(result);
    });

    test('should return data of mutations for multi segment multi reference organism', async () => {
        mockRequest.lapis.details(200, { info, data: [{ genotype: genome1 }] });
        mockRequest.lapis.nucleotideMutations(200, { info, data: multiSegMultiRefNucleotideMutations });
        mockRequest.lapis.aminoAcidMutations(200, { info, data: multiSegMultiRefAminoAcidMutations });

        const result = await getTableData('accession', schema, MULTI_SEG_MULTI_REF_REFERENCEGENOMES, lapisClient);

        expectMutationDataMatches(result, 'L', 'gene1L');
    });

    function expectMutationDataMatches(
        result: Result<GetTableDataResult, ProblemDetail>,
        segment = '',
        gene = 'gene1',
    ) {
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
                        segment: segment,
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
                        segment: gene,
                        mutations: [
                            {
                                mutationFrom: 'N',
                                mutationTo: 'Y',
                                position: 10,
                                sequenceName: gene,
                            },
                            {
                                mutationFrom: 'T',
                                mutationTo: 'N',
                                position: 30,
                                sequenceName: gene,
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
            value: `${gene}:20-23, ${gene}:40`,
            header: aminoAcidMutationsHeader,
            type: { kind: 'mutation' },
        });
    }

    test('should return data of insertions', async () => {
        mockRequest.lapis.nucleotideInsertions(200, { info, data: nucleotideInsertions });
        mockRequest.lapis.aminoAcidInsertions(200, { info, data: aminoAcidInsertions });

        const result = await getTableData('accession', schema, SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES, lapisClient);
        expectInsertionsMatch(result);
    });

    test('should return data of insertions for single segment multi reference organism', async () => {
        mockRequest.lapis.details(200, { info, data: [{ genotype: genome1 }] });
        mockRequest.lapis.nucleotideInsertions(200, { info, data: singleSegMultiRefNucleotideInsertions });
        mockRequest.lapis.aminoAcidInsertions(200, { info, data: singleSegMultiRefAminoAcidInsertions });

        const result = await getTableData('accession', schema, SINGLE_SEG_MULTI_REF_REFERENCEGENOMES, lapisClient);
        expectInsertionsMatch(result);
    });

    test('should return data of insertions for multi segment multi reference organism', async () => {
        mockRequest.lapis.details(200, { info, data: [{ genotype: genome1 }] });
        mockRequest.lapis.nucleotideInsertions(200, { info, data: multiSegMultiRefNucleotideInsertions });
        mockRequest.lapis.aminoAcidInsertions(200, { info, data: multiSegMultiRefAminoAcidInsertions });

        const result = await getTableData('accession', schema, MULTI_SEG_MULTI_REF_REFERENCEGENOMES, lapisClient);
        expectInsertionsMatch(result, 'L', 'S', 'gene1L', 'gene1S');
    });

    function expectInsertionsMatch(
        result: Result<GetTableDataResult, ProblemDetail>,
        _segment1 = '',
        _segment2 = '',
        gene1 = 'gene1',
        gene2 = 'gene1',
    ) {
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
            value: `ins_${gene1}:123:AAA, ins_${gene2}:456:TTT`,
            header: aminoAcidMutationsHeader,
            type: { kind: 'mutation' },
        });
    }

    test('should map timestamps to human readable dates', async () => {
        mockRequest.lapis.details(200, { info, data: [{ timestampField: 1706194761 }] });

        const result = await getTableData('accession', schema, SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES, lapisClient);

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
            const result = await getTableData('accession', schema, SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES, lapisClient);
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
            SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
            lapisClient,
        );

        const data = result._unsafeUnwrap().data;

        const mutationTableEntries = data.filter((entry) =>
            [nucleotideMutationsHeader, aminoAcidMutationsHeader].includes(entry.header),
        );

        expect(data.length).greaterThanOrEqual(1, 'data.length');
        expect(mutationTableEntries).toStrictEqual([]);
    });

    test('should return the segmentReferences for a single reference genome', async () => {
        const result = await getTableData(
            accessionVersion,
            schema,
            SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
            lapisClient,
        );

        const segmentReferences = result._unsafeUnwrap().segmentReferences;

        expect(segmentReferences).to.deep.equal({ main: null });
    });

    test('should return the segmentReferences for multiple reference genomes', async () => {
        mockRequest.lapis.details(200, { info, data: [{ genotype: genome2 }] });

        const result = await getTableData(accessionVersion, schema, SINGLE_SEG_MULTI_REF_REFERENCEGENOMES, lapisClient);

        const segmentReferences = result._unsafeUnwrap().segmentReferences;

        expect(segmentReferences).toEqual({ main: genome2 });
    });

    test('should tolerate when genotype is null (as e.g. for revocation entries)', async () => {
        mockRequest.lapis.details(200, { info, data: [{ genotype: null }] });

        const result = await getTableData(accessionVersion, schema, SINGLE_SEG_MULTI_REF_REFERENCEGENOMES, lapisClient);

        const segmentReferences = result._unsafeUnwrap().segmentReferences;

        expect(segmentReferences).to.deep.equal({ main: null });
    });
});

function toLapisEntry(entry: Record<string, unknown>, isRevocation = false) {
    return {
        ...entry,
        isRevocation,
    };
}

const nucleotideMutations: MutationProportionCount[] = mutationProportionCountWithSequenceName(
    [
        {
            mutationFrom: 'T',
            mutationTo: 'A',
            position: 10,
        },
        {
            mutationFrom: 'A',
            mutationTo: '-',
            position: 20,
        },
        {
            mutationFrom: 'A',
            mutationTo: '-',
            position: 21,
        },
        {
            mutationFrom: 'C',
            mutationTo: 'G',
            position: 30,
        },
        {
            mutationFrom: 'G',
            mutationTo: '-',
            position: 40,
        },
        {
            mutationFrom: 'C',
            mutationTo: '-',
            position: 41,
        },
        {
            mutationFrom: 'T',
            mutationTo: '-',
            position: 42,
        },
        {
            mutationFrom: 'T',
            mutationTo: '-',
            position: 39,
        },
        {
            mutationFrom: 'T',
            mutationTo: '-',
            position: 43,
        },
        {
            mutationFrom: 'T',
            mutationTo: '-',
            position: 44,
        },
        {
            mutationFrom: 'T',
            mutationTo: '-',
            position: 45,
        },
        {
            mutationFrom: 'T',
            mutationTo: '-',
            position: 400,
        },
    ],
    null,
);

const singleSegMultiRefNucleotideMutations: MutationProportionCount[] = mutationProportionCountWithSequenceName(
    nucleotideMutations,
    genome1,
);

const multiSegMultiRefNucleotideMutations: MutationProportionCount[] = mutationProportionCountWithSequenceName(
    nucleotideMutations,
    `L-${genome1}`,
);

const aminoAcidMutations: MutationProportionCount[] = mutationProportionCountWithSequenceName(
    [
        {
            mutationFrom: 'N',
            mutationTo: 'Y',
            position: 10,
        },
        {
            mutationFrom: 'R',
            mutationTo: '-',
            position: 20,
        },
        {
            mutationFrom: 'R',
            mutationTo: '-',
            position: 21,
        },
        {
            mutationFrom: 'N',
            mutationTo: '-',
            position: 22,
        },
        {
            mutationFrom: 'P',
            mutationTo: '-',
            position: 23,
        },
        {
            mutationFrom: 'T',
            mutationTo: 'N',
            position: 30,
        },
        {
            mutationFrom: 'F',
            mutationTo: '-',
            position: 40,
        },
    ],
    'gene1',
);

const singleSegMultiRefAminoAcidMutations: MutationProportionCount[] = mutationProportionCountWithSequenceName(
    aminoAcidMutations,
    `gene1-${genome1}`,
);

const multiSegMultiRefAminoAcidMutations: MutationProportionCount[] = mutationProportionCountWithSequenceName(
    aminoAcidMutations,
    `gene1L-${genome1}`,
);

function mutationProportionCountWithSequenceName(
    mutations: Pick<MutationProportionCount, 'mutationTo' | 'mutationFrom' | 'position'>[],
    sequenceName: string | null,
): MutationProportionCount[] {
    return mutations.map((mutation) => ({
        ...mutation,
        count: 0,
        proportion: 0,
        mutation: `${sequenceName === null ? '' : `${sequenceName}:`}${mutation.mutationFrom}${mutation.position}${mutation.mutationTo}`,
        sequenceName,
    }));
}

const nucleotideInsertions = [
    { count: 0, insertion: 'ins_123:AAA', insertedSymbols: 'AAA', position: 123, sequenceName: null },
    { count: 0, insertion: 'ins_456:GCT', insertedSymbols: 'GCT', position: 456, sequenceName: null },
];
const singleSegMultiRefNucleotideInsertions = [
    { count: 0, insertion: `ins_${genome1}:123:AAA`, insertedSymbols: 'AAA', position: 123, sequenceName: genome1 },
    { count: 0, insertion: `ins_${genome1}:456:GCT`, insertedSymbols: 'GCT', position: 456, sequenceName: genome1 },
];
const multiSegMultiRefNucleotideInsertions = [
    {
        count: 0,
        insertion: `ins_L-${genome1}:123:AAA`,
        insertedSymbols: 'AAA',
        position: 123,
        sequenceName: `L-${genome1}`,
    },
    { count: 0, insertion: `ins_S:456:GCT`, insertedSymbols: 'GCT', position: 456, sequenceName: `S` },
];
const aminoAcidInsertions = [
    { count: 0, insertion: 'ins_gene1:123:AAA', insertedSymbols: 'AAA', position: 123, sequenceName: 'gene1' },
    { count: 0, insertion: 'ins_gene1:456:TTT', insertedSymbols: 'TTT', position: 456, sequenceName: 'gene1' },
];
const singleSegMultiRefAminoAcidInsertions = [
    {
        count: 0,
        insertion: `ins_gene1-${genome1}:123:AAA`,
        insertedSymbols: 'AAA',
        position: 123,
        sequenceName: `gene1-${genome1}`,
    },
    {
        count: 0,
        insertion: `ins_gene1-${genome1}:456:TTT`,
        insertedSymbols: 'TTT',
        position: 456,
        sequenceName: `gene1-${genome1}`,
    },
];
const multiSegMultiRefAminoAcidInsertions = [
    {
        count: 0,
        insertion: `ins_gene1L-${genome1}:123:AAA`,
        insertedSymbols: 'AAA',
        position: 123,
        sequenceName: `gene1L-${genome1}`,
    },
    {
        count: 0,
        insertion: `ins_gene1S:456:TTT`,
        insertedSymbols: 'TTT',
        position: 456,
        sequenceName: `gene1S`,
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
