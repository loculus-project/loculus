import { type DatasetRecord, DatasetRecordType } from '../types/datasetCitation';

const getAccessionsByType = (type: string, records: DatasetRecord[]): string[] => {
    return records.filter((record) => record.type === type).map((record) => record.accession);
};

export const serializeRecordsToAccessionsInput = (records?: DatasetRecord[], delimiter = ',') => {
    if (!records || records.length === 0) {
        return {
            [DatasetRecordType.loculus]: '',
            [DatasetRecordType.genbank]: '',
            [DatasetRecordType.sra]: '',
            [DatasetRecordType.gisaid]: '',
        };
    }
    return {
        [DatasetRecordType.loculus]: getAccessionsByType(DatasetRecordType.loculus, records).join(`${delimiter} `),
        [DatasetRecordType.genbank]: getAccessionsByType(DatasetRecordType.genbank, records).join(`${delimiter} `),
        [DatasetRecordType.sra]: getAccessionsByType(DatasetRecordType.sra, records).join(`${delimiter} `),
        [DatasetRecordType.gisaid]: getAccessionsByType(DatasetRecordType.gisaid, records).join(`${delimiter} `),
    };
};

const nucleotidePatterns = [/^[A-Z]{1}\d{5}$/, /^[A-Z]{2}\d{6}$/, /^[A-Z]{2}\d{8}$/];
const proteinPatterns = [/^[A-Z]{3}\d{5}$/, /^[A-Z]{3}\d{7}$/];
const wgsPatterns = [/^[A-Z]{4}\d{2}\d{6,}$/, /^[A-Z]{6}\d{2}\d{7,}$/];
const mgaPatterns = [/^[A-Z]{5}\d{7}$/];

const validateGenbankAccession = (accession: string): boolean => {
    // https://www.ncbi.nlm.nih.gov/genbank/acc_prefix/

    return [...nucleotidePatterns, ...proteinPatterns, ...wgsPatterns, ...mgaPatterns].some((pattern) =>
        pattern.test(accession),
    );
};

const studyPatterns = [/^SRP\d+$/, /^ERP\d+$/, /^DRP\d+$/];
const samplePatterns = [/^SRS\d+$/, /^ERS\d+$/, /^DRS\d+$/];
const experimentPatterns = [/^SRX\d+$/, /^ERX\d+$/, /^DRX\d+$/];
const runPatterns = [/^SRR\d+$/, /^ERR\d+$/, /^DRR\d+$/];

const validateSRAAccession = (accession: string): boolean => {
    return [...studyPatterns, ...samplePatterns, ...experimentPatterns, ...runPatterns].some((pattern) =>
        pattern.test(accession),
    );
};

const gisaidPatterns = [/^EPI_ISL_\d+$/];

const validateGISAIDAccession = (accession: string): boolean => {
    return gisaidPatterns.some((pattern) => pattern.test(accession));
};

// TODO: update after finalizing accession format:
// https://github.com/loculus-project/loculus/issues/444
const loculusPatterns = [/^[A-Z]+_\d+(\.\d+)?(\d+)?$/];

const validateLoculusAccession = (accession: string): boolean => {
    return loculusPatterns.some((pattern) => pattern.test(accession));
};

export const validateAccessionByType = (accession: string, type: DatasetRecordType): boolean => {
    switch (type) {
        case DatasetRecordType.loculus:
            return validateLoculusAccession(accession);
        case DatasetRecordType.genbank:
            return validateGenbankAccession(accession);
        case DatasetRecordType.sra:
            return validateSRAAccession(accession);
        case DatasetRecordType.gisaid:
            return validateGISAIDAccession(accession);
        default:
            return false;
    }
};
