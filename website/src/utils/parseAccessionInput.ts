import { type DatasetRecord, AccessionType } from '../types';

const getAccessionsByType = (type: string, records: DatasetRecord[]): string[] => {
    return records.filter((record) => record.type === type).map((record) => record.accession ?? '');
};

export const serializeRecordsToAccessionsInput = (records?: DatasetRecord[], delimiter = ',') => {
    if (!records || records.length === 0) {
        return {
            [AccessionType.pathoplexus]: '',
            [AccessionType.genbank]: '',
            [AccessionType.sra]: '',
            [AccessionType.gisaid]: '',
        };
    }
    return {
        [AccessionType.pathoplexus]: getAccessionsByType(AccessionType.pathoplexus, records).join(`${delimiter} `),
        [AccessionType.genbank]: getAccessionsByType(AccessionType.genbank, records).join(`${delimiter} `),
        [AccessionType.sra]: getAccessionsByType(AccessionType.sra, records).join(`${delimiter} `),
        [AccessionType.gisaid]: getAccessionsByType(AccessionType.gisaid, records).join(`${delimiter} `),
    };
};

export const parseRecordsFromAccessionInput = (accessions: { [key in AccessionType]: string }): DatasetRecord[] => {
    const records: DatasetRecord[] = [];

    const cleanAccessionInput = (accessionInput: string, delimiter = ','): string[] => {
        return accessionInput
            .split(delimiter)
            .map((accession) => accession.trim())
            .filter((accession) => accession.length > 0);
    };

    Object.values(AccessionType).forEach((type) => {
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
