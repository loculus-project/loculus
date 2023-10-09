import type { Dataset } from '../../types';

export const mockDatasets: Dataset[] = [
    {
        datasetId: '45FXCV1XV82ha29uBaGbRh',
        datasetDOI: undefined,
        createdBy: 'User Name',
        version: '1',
        status: 'status_1',
        createdAt: '2021-01-01',
        lastModifiedDate: '2022-01-01',
        name: 'Dataset study name 1',
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
        datasetId: 'g5VZLR5PDcZYnyWV8v35BT',
        datasetDOI: undefined,
        createdBy: 'User Name',
        version: '1',
        status: 'status_2',
        createdAt: '2022-01-01',
        lastModifiedDate: '2023-01-01',
        name: 'Dataset study name 2',
        description: 'description_2',
        sequences: [
            {
                sequenceId: 'id_2',
                sraAccession: 'ERR10737858',
            },
        ],
    },
];

export const mockDatasetAggCitations = [
    {
        citationId: 'citationId_1',
        datasetId: '45FXCV1XV82ha29uBaGbRh',
        authors: 'authors_1',
        title: 'title_1',
        journal: 'journal_1',
        volume: 'volume_1',
        issue: 'issue_1',
        pages: 'pages_1',
        year: 'year_1',
        doi: 'doi_1',
        pubmedId: 'pubmedId_1',
        abstract: 'abstract_1',
        comments: 'comments_1',
    },
    {
        citationId: 'citationId_2',
        datasetId: 'g5VZLR5PDcZYnyWV8v35BT',
        authors: 'authors_2',
        title: 'title_2',
        journal: 'journal_2',
        volume: 'volume_2',
        issue: 'issue_2',
        pages: 'pages_2',
        year: 'year_2',
        doi: 'doi_2',
        pubmedId: 'pubmedId_2',
        abstract: 'abstract_2',
        comments: 'comments_2',
    },
];

export const mockUserAggCitations = [
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
