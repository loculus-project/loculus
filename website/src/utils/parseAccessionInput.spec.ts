import { expect, test, describe } from 'vitest';

import { serializeRecordsToAccessionsInput, parseRecordsFromAccessionInput } from './parseAccessionInput';
import { DatasetRecordType } from '../types/datasets';

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
