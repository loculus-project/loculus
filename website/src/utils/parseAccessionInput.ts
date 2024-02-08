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

const validateGenbankAccession = (accession: string): boolean => {
    // https://www.ncbi.nlm.nih.gov/genbank/acc_prefix/

    // Nucleotide patterns
    const nucleotidePatterns = [/^[A-Z]{1}\d{5}$/, /^[A-Z]{2}\d{6}$/, /^[A-Z]{2}\d{8}$/];

    // Protein patterns
    const proteinPatterns = [/^[A-Z]{3}\d{5}$/, /^[A-Z]{3}\d{7}$/];

    // WGS patterns
    const wgsPatterns = [/^[A-Z]{4}\d{2}\d{6,}$/, /^[A-Z]{6}\d{2}\d{7,}$/];

    // MGA pattern
    const mgaPatterns = [/^[A-Z]{5}\d{7}$/];

    return [...nucleotidePatterns, ...proteinPatterns, ...wgsPatterns, ...mgaPatterns].some((pattern) =>
        pattern.test(accession),
    );
};

const validateSRAAccession = (accession: string): boolean => {
    // Study patterns
    const studyPatterns = [/^SRP\d+$/, /^ERP\d+$/, /^DRP\d+$/];

    // Sample patterns
    const samplePatterns = [/^SRS\d+$/, /^ERS\d+$/, /^DRS\d+$/];

    // Experiment patterns
    const experimentPatterns = [/^SRX\d+$/, /^ERX\d+$/, /^DRX\d+$/];

    // Run patterns
    const runPatterns = [/^SRR\d+$/, /^ERR\d+$/, /^DRR\d+$/];

    return [...studyPatterns, ...samplePatterns, ...experimentPatterns, ...runPatterns].some((pattern) =>
        pattern.test(accession),
    );
};

const validateGISAIDAccession = (accession: string): boolean => {
    const gisaidPatterns = [/^EPI_ISL_\d+$/];
    return gisaidPatterns.some((pattern) => pattern.test(accession));
};

const validateLoculusAccession = (accession: string): boolean => {
    // TODO: update after finalizing accession format:
    // https://github.com/loculus-project/loculus/issues/444
    const loculusPatterns = [/^[A-Z]+_\d+(\.\d+)?(\d+)?$/];
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
