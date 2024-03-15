import { type DatasetRecord, DatasetRecordType } from '../types/datasetCitation';

const getAccessionsByType = (type: string, records: DatasetRecord[]): string[] => {
    return records.filter((record) => record.type === type).map((record) => record.accession);
};

export const serializeRecordsToAccessionsInput = (records?: DatasetRecord[], delimiter = ',') => {
    if (!records || records.length === 0) {
        return {
            [DatasetRecordType.loculus]: '',
        };
    }
    return {
        [DatasetRecordType.loculus]: getAccessionsByType(DatasetRecordType.loculus, records).join(`${delimiter} `),
    };
};
