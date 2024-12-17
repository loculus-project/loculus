import { err } from 'neverthrow';
import { beforeEach, describe, expect, test } from 'vitest';

import { getTableData } from './getTableData.ts';
import { type TableDataEntry } from './types.ts';
import { mockRequest, testConfig } from '../../../vitest.setup.ts';
import { LapisClient } from '../../services/lapisClient.ts';
import type { Schema } from '../../types/config.ts';
import type { MutationProportionCount } from '../../types/lapis.ts';

const schema: Schema = {
    organismName: 'instance name',
    metadata: [
        { name: 'metadataField1', type: 'string', header: 'testHeader1' },
        { name: 'metadataField2', type: 'string' },
        { name: 'timestampField', type: 'timestamp' },
    ],
    tableColumns: [],
    defaultOrderBy: 'metadataField1',
    defaultOrder: 'ascending',
    primaryKey: 'primary key',
    inputFields: [],
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

const lapisClient = LapisClient.create(testConfig.serverSide.lapisUrls.dummy, schema);

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

        const result = await getTableData(accessionVersion, schema, lapisClient);

        expect(result).toStrictEqual(err(dummyError.error));
    });

    test('should return an error when getSequenceMutations fails', async () => {
        mockRequest.lapis.nucleotideMutations(500, dummyError);

        const result = await getTableData(accessionVersion, schema, lapisClient);

        expect(result).toStrictEqual(err(dummyError.error));
    });

    test('should return an error when getSequenceInsertions fails', async () => {
        mockRequest.lapis.nucleotideInsertions(500, dummyError);

        const result = await getTableData(accessionVersion, schema, lapisClient);

        expect(result).toStrictEqual(err(dummyError.error));
    });

    test('should return default values when there is no data', async () => {
        const result = await getTableData(accessionVersion, schema, lapisClient);

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

        const result = await getTableData('accession', schema, lapisClient);

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

        const result = await getTableData('accession', schema, lapisClient);

        const data = result._unsafeUnwrap().data;
        expect(data).toContainEqual({
            label: 'Substitutions',
            name: 'nucleotideSubstitutions',
            value: '',
            header: 'Nucleotide mutations',
            customDisplay: {
                type: 'badge',
                value: [
                    {
                        segment: '',
                        mutations: [
                            {
                                count: 0,
                                mutation: 'T10A',
                                mutationFrom: 'T',
                                mutationTo: 'A',
                                position: 10,
                                proportion: 0,
                                sequenceName: null,
                            },
                            {
                                count: 0,
                                mutation: 'C30G',
                                mutationFrom: 'C',
                                mutationTo: 'G',
                                position: 30,
                                proportion: 0,
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
            header: 'Nucleotide mutations',
            type: { kind: 'mutation' },
        });
        expect(data).toContainEqual({
            label: 'Substitutions',
            name: 'aminoAcidSubstitutions',
            value: '',
            header: 'Amino acid mutations',
            customDisplay: {
                type: 'badge',
                value: [
                    {
                        segment: 'gene1',
                        mutations: [
                            {
                                count: 0,
                                mutation: 'gene1:N10Y',
                                mutationFrom: 'N',
                                mutationTo: 'Y',
                                position: 10,
                                proportion: 0,
                                sequenceName: 'gene1',
                            },
                            {
                                count: 0,
                                mutation: 'gene1:T30N',
                                mutationFrom: 'T',
                                mutationTo: 'N',
                                position: 30,
                                proportion: 0,
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
            header: 'Amino acid mutations',
            type: { kind: 'mutation' },
        });
    });

    test('should return data of insertions', async () => {
        mockRequest.lapis.nucleotideInsertions(200, { info, data: nucleotideInsertions });
        mockRequest.lapis.aminoAcidInsertions(200, { info, data: aminoAcidInsertions });

        const result = await getTableData('accession', schema, lapisClient);

        const data = result._unsafeUnwrap().data;
        expect(data).toContainEqual({
            label: 'Insertions',
            name: 'nucleotideInsertions',
            value: 'nucleotideInsertion1, nucleotideInsertion2',
            header: 'Nucleotide mutations',
            type: { kind: 'mutation' },
        });
        expect(data).toContainEqual({
            label: 'Insertions',
            name: 'aminoAcidInsertions',
            value: 'aminoAcidInsertion1, aminoAcidInsertion2',
            header: 'Amino acid mutations',
            type: { kind: 'mutation' },
        });
    });

    test('should map timestamps to human readable dates', async () => {
        mockRequest.lapis.details(200, { info, data: [{ timestampField: 1706194761 }] });

        const result = await getTableData('accession', schema, lapisClient);

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
            const result = await getTableData('accession', schema, lapisClient);
            const isRevocation = result._unsafeUnwrap().isRevocation;
            expect(isRevocation).toBe(expectedIsRevocation);
        }
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

const nucleotideInsertions = [
    { count: 0, insertion: 'nucleotideInsertion1' },
    { count: 0, insertion: 'nucleotideInsertion2' },
];
const aminoAcidInsertions = [
    { count: 0, insertion: 'aminoAcidInsertion1' },
    { count: 0, insertion: 'aminoAcidInsertion2' },
];

const defaultMutationsInsertionsDeletionsList: TableDataEntry[] = [
    {
        label: 'Substitutions',
        name: 'nucleotideSubstitutions',
        value: '',
        header: 'Nucleotide mutations',
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
        header: 'Nucleotide mutations',
        type: { kind: 'mutation' },
    },
    {
        label: 'Insertions',
        name: 'nucleotideInsertions',
        value: '',
        header: 'Nucleotide mutations',
        type: { kind: 'mutation' },
    },
    {
        label: 'Substitutions',
        name: 'aminoAcidSubstitutions',
        value: '',
        header: 'Amino acid mutations',
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
        header: 'Amino acid mutations',
        type: { kind: 'mutation' },
    },
    {
        label: 'Insertions',
        name: 'aminoAcidInsertions',
        value: '',
        header: 'Amino acid mutations',
        type: { kind: 'mutation' },
    },
];
