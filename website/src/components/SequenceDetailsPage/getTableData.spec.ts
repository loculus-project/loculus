import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, test } from 'vitest';

import { type TableDataEntry, getTableData, toHeaderMap } from './getTableData.ts';
import { mockRequest, testConfig } from '../../../vitest.setup.ts';
import { LapisClient } from '../../services/lapisClient.ts';
import type { Schema } from '../../types/config.ts';

const schema: Schema = {
    instanceName: 'instance name',
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

const accessionVersion = 'accession';

const lapisClient = LapisClient.create(testConfig.serverSide.lapisUrls.dummy, schema);

describe('getTableData', () => {
    beforeEach(() => {
        mockRequest.lapis.details(200, { data: [{ dummyField: 'dummyValue' }] });
        mockRequest.lapis.nucleotideMutations(200, { data: [] });
        mockRequest.lapis.aminoAcidMutations(200, { data: [] });
        mockRequest.lapis.nucleotideInsertions(200, { data: [] });
        mockRequest.lapis.aminoAcidInsertions(200, { data: [] });
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

        const defaultList: TableDataEntry[] = [
            {
                label: 'Metadata field1',
                name: 'metadataField1',
                value: 'N/A',
                customDisplay: undefined,
                header: 'testHeader1',
            },
            {
                label: 'Metadata field2',
                name: 'metadataField2',
                value: 'N/A',
                customDisplay: undefined,
                header: '',
            },
            {
                label: 'Timestamp field',
                name: 'timestampField',
                value: 'N/A',
                customDisplay: undefined,
                header: '',
            },
        ];

        expect(result).toStrictEqual(ok(defaultList.concat(defaultMutationsInsertionsDeletionsList)));
    });

    test('toHeaderMap should return default values when there is no data', async () => {
        const result = await getTableData(accessionVersion, schema, lapisClient);

        const data = result._unsafeUnwrap();
        const defaultHeaderMap = toHeaderMap(data);

        expect(defaultHeaderMap['Mutations, insertions, deletions']).toStrictEqual(
            defaultMutationsInsertionsDeletionsList,
        );
        expect(defaultHeaderMap['']).toStrictEqual(defaultNoHeaderList);
        expect(defaultHeaderMap.testHeader1).toStrictEqual(defaultHeader1List);
    });

    test('should return details field values', async () => {
        const value1 = 'value 1';
        const value2 = 'value 2';

        mockRequest.lapis.details(200, {
            data: [
                {
                    metadataField1: value1,
                    metadataField2: value2,
                },
            ],
        });

        const result = await getTableData('accession', schema, lapisClient);

        const data = result._unsafeUnwrap();
        expect(data).toContainEqual({
            label: 'Metadata field1',
            name: 'metadataField1',
            value: value1,
            header: 'testHeader1',
        });
        expect(data).toContainEqual({
            label: 'Metadata field2',
            name: 'metadataField2',
            value: value2,
            header: '',
        });
    });

    test('should return data of mutations', async () => {
        mockRequest.lapis.nucleotideMutations(200, { data: nucleotideMutations });
        mockRequest.lapis.aminoAcidMutations(200, { data: aminoAcidMutations });

        const result = await getTableData('accession', schema, lapisClient);

        const data = result._unsafeUnwrap();
        expect(data).toContainEqual({
            label: 'Nucleotide substitutions',
            name: 'nucleotideSubstitutions',
            value: 'T10A, C30G',
            header: 'Mutations, insertions, deletions',
        });
        expect(data).toContainEqual({
            label: 'Nucleotide deletions',
            name: 'nucleotideDeletions',
            value: '20, 21, 39-45, 400',
            header: 'Mutations, insertions, deletions',
        });
        expect(data).toContainEqual({
            label: 'Amino acid substitutions',
            name: 'aminoAcidSubstitutions',
            value: 'gene1:N10Y, gene1:T30N',
            header: 'Mutations, insertions, deletions',
        });
        expect(data).toContainEqual({
            label: 'Amino acid deletions',
            name: 'aminoAcidDeletions',
            value: 'gene1:20-23, gene1:40',
            header: 'Mutations, insertions, deletions',
        });
    });

    test('should return data of insertions', async () => {
        mockRequest.lapis.nucleotideInsertions(200, { data: nucleotideInsertions });
        mockRequest.lapis.aminoAcidInsertions(200, { data: aminoAcidInsertions });

        const result = await getTableData('accession', schema, lapisClient);

        const data = result._unsafeUnwrap();
        expect(data).toContainEqual({
            label: 'Nucleotide insertions',
            name: 'nucleotideInsertions',
            value: 'nucleotideInsertion1, nucleotideInsertion2',
            header: 'Mutations, insertions, deletions',
        });
        expect(data).toContainEqual({
            label: 'Amino acid insertions',
            name: 'aminoAcidInsertions',
            value: 'aminoAcidInsertion1, aminoAcidInsertion2',
            header: 'Mutations, insertions, deletions',
        });
    });

    test('should map timestamps to human readable dates', async () => {
        mockRequest.lapis.details(200, { data: [{ timestampField: 1706194761 }] });

        const result = await getTableData('accession', schema, lapisClient);

        const data = result._unsafeUnwrap();
        expect(data).toContainEqual({
            label: 'Timestamp field',
            name: 'timestampField',
            value: '2024-01-25 14:59:21 UTC',
            header: '',
        });
    });
});

const nucleotideMutations = [
    { count: 0, proportion: 0, mutation: 'T10A' },
    { count: 0, proportion: 0, mutation: 'A20-' },
    { count: 0, proportion: 0, mutation: 'A21-' },
    { count: 0, proportion: 0, mutation: 'C30G' },
    { count: 0, proportion: 0, mutation: 'G40-' },
    { count: 0, proportion: 0, mutation: 'C41-' },
    { count: 0, proportion: 0, mutation: 'T42-' },
    { count: 0, proportion: 0, mutation: 'T39-' },
    { count: 0, proportion: 0, mutation: 'T43-' },
    { count: 0, proportion: 0, mutation: 'T44-' },
    { count: 0, proportion: 0, mutation: 'T45-' },
    { count: 0, proportion: 0, mutation: 'T400-' },
];
const aminoAcidMutations = [
    { count: 0, proportion: 0, mutation: 'gene1:N10Y' },
    { count: 0, proportion: 0, mutation: 'gene1:R20-' },
    { count: 0, proportion: 0, mutation: 'gene1:R21-' },
    { count: 0, proportion: 0, mutation: 'gene1:N22-' },
    { count: 0, proportion: 0, mutation: 'gene1:P23-' },
    { count: 0, proportion: 0, mutation: 'gene1:T30N' },
    { count: 0, proportion: 0, mutation: 'gene1:F40-' },
];

const nucleotideInsertions = [
    { count: 0, insertion: 'nucleotideInsertion1' },
    { count: 0, insertion: 'nucleotideInsertion2' },
];
const aminoAcidInsertions = [
    { count: 0, insertion: 'aminoAcidInsertion1' },
    { count: 0, insertion: 'aminoAcidInsertion2' },
];

const defaultNoHeaderList: TableDataEntry[] = [
    {
        label: 'Metadata field2',
        name: 'metadataField2',
        value: 'N/A',
        customDisplay: undefined,
        header: '',
    },
    {
        label: 'Timestamp field',
        name: 'timestampField',
        value: 'N/A',
        customDisplay: undefined,
        header: '',
    },
];

const defaultHeader1List: TableDataEntry[] = [
    {
        label: 'Metadata field1',
        name: 'metadataField1',
        value: 'N/A',
        customDisplay: undefined,
        header: 'testHeader1',
    },
];

const defaultMutationsInsertionsDeletionsList: TableDataEntry[] = [
    {
        label: 'Nucleotide substitutions',
        name: 'nucleotideSubstitutions',
        value: '',
        header: 'Mutations, insertions, deletions',
    },
    {
        label: 'Nucleotide deletions',
        name: 'nucleotideDeletions',
        value: '',
        header: 'Mutations, insertions, deletions',
    },
    {
        label: 'Nucleotide insertions',
        name: 'nucleotideInsertions',
        value: '',
        header: 'Mutations, insertions, deletions',
    },
    {
        label: 'Amino acid substitutions',
        name: 'aminoAcidSubstitutions',
        value: '',
        header: 'Mutations, insertions, deletions',
    },
    {
        label: 'Amino acid deletions',
        name: 'aminoAcidDeletions',
        value: '',
        header: 'Mutations, insertions, deletions',
    },
    {
        label: 'Amino acid insertions',
        name: 'aminoAcidInsertions',
        value: '',
        header: 'Mutations, insertions, deletions',
    },
];
