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

/** Accessions that appear more than once, in order of first appearance. Like the backend, this compares exact strings. */
export const findDuplicateAccessions = (records: { accession: string }[]) => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const { accession } of records) {
        if (seen.has(accession)) {
            duplicates.add(accession);
        }
        seen.add(accession);
    }
    return [...duplicates];
};
