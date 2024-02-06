import { expect, test, describe } from 'vitest';

import {
    serializeRecordsToAccessionsInput,
    parseRecordsFromAccessionInput,
    validateAccessionByType,
} from './parseAccessionInput';
import { DatasetRecordType } from '../types/datasetCitation';

describe('serializeRecordsToAccessionsInput', () => {
    test('should serialize records to accessions input by type', () => {
        const records = [
            { accession: 'A123', type: DatasetRecordType.loculus },
            { accession: 'B456', type: DatasetRecordType.genbank },
            { accession: 'C789', type: DatasetRecordType.sra },
            { accession: 'D012', type: DatasetRecordType.gisaid },
        ];

        const serialized = serializeRecordsToAccessionsInput(records, ',');

        expect(serialized[DatasetRecordType.loculus]).toBe('A123');
        expect(serialized[DatasetRecordType.genbank]).toBe('B456');
        expect(serialized[DatasetRecordType.sra]).toBe('C789');
        expect(serialized[DatasetRecordType.gisaid]).toBe('D012');
    });

    test('should handle joining records of the same type', () => {
        const records = [
            { accession: 'A123', type: DatasetRecordType.loculus },
            { accession: 'B456', type: DatasetRecordType.loculus },
            { accession: 'C789', type: DatasetRecordType.sra },
            { accession: 'D012', type: DatasetRecordType.sra },
        ];

        const serialized = serializeRecordsToAccessionsInput(records, ',');

        expect(serialized[DatasetRecordType.loculus]).toBe('A123, B456');
        expect(serialized[DatasetRecordType.sra]).toBe('C789, D012');
    });

    test('should handle empty records', () => {
        const serialized = serializeRecordsToAccessionsInput([]);

        expect(serialized[DatasetRecordType.loculus]).toBe('');
        expect(serialized[DatasetRecordType.genbank]).toBe('');
        expect(serialized[DatasetRecordType.sra]).toBe('');
        expect(serialized[DatasetRecordType.gisaid]).toBe('');
    });
});

describe('parseRecordsFromAccessionInput', () => {
    test('should parse accessions input to records by type', () => {
        const accessions = {
            [DatasetRecordType.loculus]: 'A123',
            [DatasetRecordType.genbank]: 'B456',
            [DatasetRecordType.sra]: 'C789',
            [DatasetRecordType.gisaid]: 'D012',
        };

        const records = parseRecordsFromAccessionInput(accessions);

        expect(records).toContainEqual({ accession: 'A123', type: DatasetRecordType.loculus });
        expect(records).toContainEqual({ accession: 'B456', type: DatasetRecordType.genbank });
        expect(records).toContainEqual({ accession: 'C789', type: DatasetRecordType.sra });
        expect(records).toContainEqual({ accession: 'D012', type: DatasetRecordType.gisaid });
    });

    test('should handle splitting records of the same type', () => {
        const accessions = {
            [DatasetRecordType.loculus]: 'A123, B456',
            [DatasetRecordType.genbank]: 'C789, D012',
            [DatasetRecordType.sra]: '',
            [DatasetRecordType.gisaid]: '',
        };

        const records = parseRecordsFromAccessionInput(accessions);

        expect(records).toContainEqual({ accession: 'A123', type: DatasetRecordType.loculus });
        expect(records).toContainEqual({ accession: 'B456', type: DatasetRecordType.loculus });
        expect(records).toContainEqual({ accession: 'C789', type: DatasetRecordType.genbank });
        expect(records).toContainEqual({ accession: 'D012', type: DatasetRecordType.genbank });
    });

    test('should handle empty accessions input', () => {
        const accessions = {
            [DatasetRecordType.loculus]: '',
            [DatasetRecordType.genbank]: '',
            [DatasetRecordType.sra]: '',
            [DatasetRecordType.gisaid]: '',
        };

        const records = parseRecordsFromAccessionInput(accessions);

        expect(records).toHaveLength(0);
    });
});

describe('validateAccessionByType', () => {
    test('should validate loculus accessions', () => {
        expect(validateAccessionByType('ABC_123', DatasetRecordType.loculus)).toBe(true);
        expect(validateAccessionByType('XYZ_456.789', DatasetRecordType.loculus)).toBe(true);
        expect(validateAccessionByType('PQR_789.123456', DatasetRecordType.loculus)).toBe(true);
        expect(validateAccessionByType('123', DatasetRecordType.loculus)).toBe(false);
        expect(validateAccessionByType('ABC', DatasetRecordType.loculus)).toBe(false);
        expect(validateAccessionByType('PQR_789.', DatasetRecordType.loculus)).toBe(false);
        expect(validateAccessionByType('PQR_789.23.1', DatasetRecordType.loculus)).toBe(false);
        expect(validateAccessionByType('ABC_123!', DatasetRecordType.loculus)).toBe(false);
    });
    test('should validate genbank accessions', () => {
        expect(validateAccessionByType('A12345', DatasetRecordType.genbank)).toBe(true);
        expect(validateAccessionByType('AB123456', DatasetRecordType.genbank)).toBe(true);
        expect(validateAccessionByType('YZ123456', DatasetRecordType.genbank)).toBe(true);
        expect(validateAccessionByType('AB12345678', DatasetRecordType.genbank)).toBe(true);
        expect(validateAccessionByType('ABC12345', DatasetRecordType.genbank)).toBe(true);
        expect(validateAccessionByType('ABC1234567', DatasetRecordType.genbank)).toBe(true);
        expect(validateAccessionByType('ABCD12345678', DatasetRecordType.genbank)).toBe(true);
        expect(validateAccessionByType('ABCDEF12123456789', DatasetRecordType.genbank)).toBe(true);
        expect(validateAccessionByType('ABCDE1234567', DatasetRecordType.genbank)).toBe(true);
        expect(validateAccessionByType('123', DatasetRecordType.genbank)).toBe(false);
        expect(validateAccessionByType('ABC', DatasetRecordType.genbank)).toBe(false);
        expect(validateAccessionByType('A12345!', DatasetRecordType.genbank)).toBe(false);
    });
    test('should validate sra accessions', () => {
        expect(validateAccessionByType('SRP123456', DatasetRecordType.sra)).toBe(true);
        expect(validateAccessionByType('ERS789012', DatasetRecordType.sra)).toBe(true);
        expect(validateAccessionByType('DRX345678', DatasetRecordType.sra)).toBe(true);
        expect(validateAccessionByType('ERR987654', DatasetRecordType.sra)).toBe(true);
        expect(validateAccessionByType('ABC123456', DatasetRecordType.sra)).toBe(false);
        expect(validateAccessionByType('123', DatasetRecordType.sra)).toBe(false);
        expect(validateAccessionByType('SRP', DatasetRecordType.sra)).toBe(false);
        expect(validateAccessionByType('SRP123456!', DatasetRecordType.sra)).toBe(false);
    });
    test('should validate gisaid accessions', () => {
        expect(validateAccessionByType('EPI_ISL_123456', DatasetRecordType.gisaid)).toBe(true);
        expect(validateAccessionByType('EPI_ISL_123456', DatasetRecordType.gisaid)).toBe(true);
        expect(validateAccessionByType('EPI_ISL_', DatasetRecordType.gisaid)).toBe(false);
        expect(validateAccessionByType('EPI_123456', DatasetRecordType.gisaid)).toBe(false);
        expect(validateAccessionByType('ABC_123456', DatasetRecordType.gisaid)).toBe(false);
        expect(validateAccessionByType('123456', DatasetRecordType.gisaid)).toBe(false);
        expect(validateAccessionByType('EPI_ISL_123456!', DatasetRecordType.gisaid)).toBe(false);
    });
});
