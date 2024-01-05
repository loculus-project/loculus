import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, test } from 'vitest';

import { getTableData, getVersionStatus } from './getTableData.ts';
import { mockRequest, testConfig } from '../../../vitest.setup.ts';
import { LapisClient } from '../../services/lapisClient.ts';
import { VERSION_STATUS_FIELD } from '../../settings.ts';
import type { Schema } from '../../types/config.ts';
import { siloVersionStatuses } from '../../types/lapis.ts';

const schema: Schema = {
    instanceName: 'instance name',
    metadata: [
        { name: 'metadataField1', type: 'string' },
        { name: 'metadataField2', type: 'string' },
    ],
    tableColumns: [],
    primaryKey: 'primary key',
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

        expect(result).toStrictEqual(
            ok([
                {
                    label: 'Metadata field1',
                    name: 'metadataField1',
                    value: 'N/A',
                },
                {
                    label: 'Metadata field2',
                    name: 'metadataField2',
                    value: 'N/A',
                },
                {
                    label: 'Nucleotide substitutions',
                    name: 'nucleotideSubstitutions',
                    value: '',
                },
                {
                    label: 'Nucleotide deletions',
                    name: 'nucleotideDeletions',
                    value: '',
                },
                {
                    label: 'Nucleotide insertions',
                    name: 'nucleotideInsertions',
                    value: '',
                },
                {
                    label: 'Amino acid substitutions',
                    name: 'aminoAcidSubstitutions',
                    value: '',
                },
                {
                    label: 'Amino acid deletions',
                    name: 'aminoAcidDeletions',
                    value: '',
                },
                {
                    label: 'Amino acid insertions',
                    name: 'aminoAcidInsertions',
                    value: '',
                },
            ]),
        );
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
        });
        expect(data).toContainEqual({
            label: 'Metadata field2',
            name: 'metadataField2',
            value: value2,
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
            value: 'nucleotideMutation1, nucleotideMutation2',
        });
        expect(data).toContainEqual({
            label: 'Nucleotide deletions',
            name: 'nucleotideDeletions',
            value: 'nucleotideDeletion1-, nucleotideDeletion2-',
        });
        expect(data).toContainEqual({
            label: 'Amino acid substitutions',
            name: 'aminoAcidSubstitutions',
            value: 'aminoAcidMutation1, aminoAcidMutation2',
        });
        expect(data).toContainEqual({
            label: 'Amino acid deletions',
            name: 'aminoAcidDeletions',
            value: 'aminoAcidDeletion1-, aminoAcidDeletion2-',
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
        });
        expect(data).toContainEqual({
            label: 'Amino acid insertions',
            name: 'aminoAcidInsertions',
            value: 'aminoAcidInsertion1, aminoAcidInsertion2',
        });
    });
});

describe('getVersionStatus', () => {
    test('should return status for correct status', () => {
        const versionStatus = getVersionStatus([
            {
                label: 'does not matter',
                name: VERSION_STATUS_FIELD,
                value: siloVersionStatuses.latestVersion,
            },
        ]);

        expect(versionStatus).toStrictEqual(siloVersionStatuses.latestVersion);
    });

    test('should throw error for unknown status', () => {
        expect(() =>
            getVersionStatus([
                {
                    label: 'does not matter',
                    name: VERSION_STATUS_FIELD,
                    value: 'unknown status',
                },
            ]),
        ).toThrowError(/Invalid version status: "unknown status"/);
    });
});

const nucleotideMutations = [
    { count: 0, proportion: 0, mutation: 'nucleotideMutation1' },
    { count: 0, proportion: 0, mutation: 'nucleotideDeletion1-' },
    { count: 0, proportion: 0, mutation: 'nucleotideMutation2' },
    { count: 0, proportion: 0, mutation: 'nucleotideDeletion2-' },
];
const aminoAcidMutations = [
    { count: 0, proportion: 0, mutation: 'aminoAcidMutation1' },
    { count: 0, proportion: 0, mutation: 'aminoAcidDeletion1-' },
    { count: 0, proportion: 0, mutation: 'aminoAcidMutation2' },
    { count: 0, proportion: 0, mutation: 'aminoAcidDeletion2-' },
];

const nucleotideInsertions = [
    { count: 0, insertion: 'nucleotideInsertion1' },
    { count: 0, insertion: 'nucleotideInsertion2' },
];
const aminoAcidInsertions = [
    { count: 0, insertion: 'aminoAcidInsertion1' },
    { count: 0, insertion: 'aminoAcidInsertion2' },
];
