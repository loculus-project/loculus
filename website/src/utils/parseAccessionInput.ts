import { type SeqSetRecord, SeqSetRecordType } from '../types/seqSetCitation';

const getAccessionsByType = (type: string, records: SeqSetRecord[]): string[] => {
    return records.filter((record) => record.type === type).map((record) => record.accession);
};

export const serializeRecordsToAccessionsInput = (records?: SeqSetRecord[], delimiter = ',') => {
    if (!records || records.length === 0) {
        return {
            [SeqSetRecordType.loculus]: '',
        };
    }
    return {
        [SeqSetRecordType.loculus]: getAccessionsByType(SeqSetRecordType.loculus, records).join(`${delimiter} `),
    };
};
