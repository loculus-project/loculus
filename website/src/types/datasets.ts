/**
 * Types for datasets and citations.
 **/

export enum AccessionType {
    loculus = 'Loculus',
    genbank = 'GenBank',
    sra = 'SRA',
    gisaid = 'GISAID',
}

export type DatasetRecord = {
    accession?: string;
    type?: AccessionType[keyof AccessionType];
};

export type Dataset = {
    datasetId: string;
    datasetDOI?: string;
    datasetVersion: string;
    name: string;
    description?: string;
    createdAt: string;
    createdBy: string;
    records?: DatasetRecord[];
};

export type AccessionCitation = {
    datasetId: string;
    date: string;
};

export type DatasetCitationResults = {
    years: string[];
    citations: number[];
};
