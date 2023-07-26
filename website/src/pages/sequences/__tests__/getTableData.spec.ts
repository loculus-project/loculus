import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { fetchInsertions, fetchMutations, fetchSequenceDetails } from '../../../api';
import type { Config } from '../../../types';
import { getTableData } from '../getTableData';

vi.mock('../../../api');

const config: Config = {
    lapisHost: 'lapis host',
    schema: {
        instanceName: 'instance name',
        metadata: [
            { name: 'metadataField1', type: 'string' },
            { name: 'metadataField2', type: 'string' },
        ],
        tableColumns: [],
        primaryKey: 'primary key',
    },
};

describe('getTableData', () => {
    beforeEach(() => {
        vi.mocked(fetchSequenceDetails).mockResolvedValue({});
        vi.mocked(fetchMutations).mockResolvedValue([]);
        vi.mocked(fetchInsertions).mockResolvedValue([]);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    test('should return undefined for undefined details data', async () => {
        vi.mocked(fetchSequenceDetails).mockResolvedValue(undefined);

        const result = await getTableData('accession', config);

        expect(result).toBe(undefined);
    });

    test('should return default values when there is no data', async () => {
        const result = await getTableData('accession', config);

        expect(result).toStrictEqual([
            {
                label: 'Metadata field1',
                value: 'N/A',
            },
            {
                label: 'Metadata field2',
                value: 'N/A',
            },
            {
                label: 'Nucleotide substitutions',
                value: '',
            },
            {
                label: 'Nucleotide deletions',
                value: '',
            },
            {
                label: 'Nucleotide insertions',
                value: '',
            },
            {
                label: 'Amino acid substitutions',
                value: '',
            },
            {
                label: 'Amino acid deletions',
                value: '',
            },
            {
                label: 'Amino acid insertions',
                value: '',
            },
        ]);
    });

    test('should return details field values', async () => {
        vi.mocked(fetchSequenceDetails).mockResolvedValue({ metadataField1: 'value 1', metadataField2: 'value 2' });

        const result = await getTableData('accession', config);

        expect(result).toContainEqual({
            label: 'Metadata field1',
            value: 'value 1',
        });
        expect(result).toContainEqual({
            label: 'Metadata field2',
            value: 'value 2',
        });
    });

    test('should return data of mutations', async () => {
        vi.mocked(fetchMutations).mockImplementation(async (_, type) =>
            type === 'nucleotide' ? nucleotideMutations : aminoAcidMutations,
        );

        const result = await getTableData('accession', config);

        expect(result).toContainEqual({
            label: 'Nucleotide substitutions',
            value: 'nucleotideMutation1, nucleotideMutation2',
        });
        expect(result).toContainEqual({
            label: 'Nucleotide deletions',
            value: 'nucleotideDeletion1-, nucleotideDeletion2-',
        });
        expect(result).toContainEqual({
            label: 'Amino acid substitutions',
            value: 'aminoAcidMutation1, aminoAcidMutation2',
        });
        expect(result).toContainEqual({
            label: 'Amino acid deletions',
            value: 'aminoAcidDeletion1-, aminoAcidDeletion2-',
        });
    });

    test('should return data of insertions', async () => {
        vi.mocked(fetchInsertions).mockImplementation(async (_, type) =>
            type === 'nucleotide' ? nucleotideInsertions : aminoAcidInsertions,
        );

        const result = await getTableData('accession', config);

        expect(result).toContainEqual({
            label: 'Nucleotide insertions',
            value: 'nucleotideInsertion1, nucleotideInsertion2',
        });
        expect(result).toContainEqual({
            label: 'Amino acid insertions',
            value: 'aminoAcidInsertion1, aminoAcidInsertion2',
        });
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
