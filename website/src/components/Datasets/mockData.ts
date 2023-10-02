import type { Dataset } from '../../types';

export const mockDatasets: Dataset[] = [
    {
        datasetId: 'dataset_id_1',
        datasetDOI: undefined,
        owner: 'User Name',
        version: '1',
        status: 'status_1',
        createdDate: '2021-01-01',
        lastModifiedDate: '2022-01-01',
        name: 'Dataset Name Placeholder 1',
        description: 'description_1',
        sequences: [
            {
                sequenceId: 'id_1',
                genbankAccession: 'OU009684',
            },
            {
                sequenceId: 'id_2',
                genbankAccession: 'OU538915',
            },
            {
                sequenceId: 'id_3',
                genbankAccession: 'OX411625',
            },
            {
                sequenceId: 'id_4',
                sraAccession: 'ERR10737858',
            },
            {
                sequenceId: 'id_5',
                sraAccession: 'ERR10744766',
            },
            {
                sequenceId: 'id_6',
                sraAccession: 'ERR10012106',
            },
            {
                sequenceId: 'id_7',
                sraAccession: 'ERR8517443',
            },
            {
                sequenceId: 'id_8',
                sraAccession: 'ERR10752369',
            },
        ],
    },
    {
        datasetId: 'dataset_id_2',
        datasetDOI: undefined,
        owner: 'User Name',
        version: '1',
        status: 'status_2',
        createdDate: '2022-01-01',
        lastModifiedDate: '2023-01-01',
        name: 'Dataset Name Placeholder 2',
        description: 'description_2',
        sequences: [
            {
                sequenceId: 'id_2',
                sraAccession: 'ERR10737858',
            },
        ],
    },
];

export const mockUserCitations = [
    {
        sequenceId: 'sequenceId1',
        citations: [
            {
                datasetId: 'datasetId1',
                date: '2023-01-01',
            },
            {
                datasetId: 'datasetId2',
                date: '2022-01-01',
            },
        ],
    },
    {
        sequenceId: 'sequenceId2',
        citations: [
            {
                datasetId: 'datasetId3',
                date: '2023-01-01',
            },
            {
                datasetId: 'datasetId4',
                date: '2021-01-01',
            },
        ],
    },
    {
        sequenceId: 'sequenceId3',
        citations: [
            {
                datasetId: 'datasetId5',
                date: '2023-01-01',
            },
            {
                datasetId: 'datasetId6',
                date: '2021-01-01',
            },
        ],
    },
];
