import { type DatasetRecord, DatasetRecordType } from '../types/datasets';

const getAccessionsByType = (type: string, records: DatasetRecord[]): string[] => {
    return records.filter((record) => record.type === type).map((record) => record.accession ?? '');
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

export const parseRecordsFromAccessionInput = (accessions: { [key in DatasetRecordType]: string }): DatasetRecord[] => {
    const records: DatasetRecord[] = [];

    const cleanAccessionInput = (accessionInput: string, delimiter = ','): string[] => {
        return accessionInput
            .split(delimiter)
            .map((accession) => accession.trim())
            .filter((accession) => accession.length > 0);
    };

    Object.values(DatasetRecordType).forEach((type) => {
        const accessionsByType = cleanAccessionInput(accessions[type]);
        accessionsByType.forEach((accession) => {
            records.push({
                accession,
                type,
            });
        });
    });
    return records;
};
