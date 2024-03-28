import { type SeqSetRecord, SeqSetRecordType } from '../types/seqSetCitation';

export const deserializeAccessionInput = (
    input: string,
    isFocal: boolean,
    type = SeqSetRecordType.loculus,
    delimiter = /[,\s]/,
) => {
    return input
        .split(delimiter)
        .map((accession) => accession.trim())
        .filter(Boolean)
        .map((accession) => ({ accession, type, isFocal }));
};

export const serializeSeqSetRecords = (records?: SeqSetRecord[], isFocal = true, delimiter = ',') => {
    if (!records || records.length === 0) {
        return '';
    }
    const filteredRecords = records.filter((record) => record.isFocal === isFocal);
    if (filteredRecords.length === 0) {
        return '';
    }
    return filteredRecords.map((record) => record.accession).join(`${delimiter} `);
};
