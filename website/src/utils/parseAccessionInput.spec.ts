import { expect, test, describe } from 'vitest';

import { serializeRecordsToAccessionsInput, parseRecordsFromAccessionInput } from './parseAccessionInput';
import { AccessionType } from '../types';

describe('serializeRecordsToAccessionsInput', () => {
    test('should serialize records to accessions input by type', () => {
        const records = [
            { accession: 'A123', type: AccessionType.pathoplexus },
            { accession: 'B456', type: AccessionType.genbank },
            { accession: 'C789', type: AccessionType.sra },
            { accession: 'D012', type: AccessionType.gisaid },
        ];

        const serialized = serializeRecordsToAccessionsInput(records, ',');

        expect(serialized[AccessionType.pathoplexus]).toBe('A123');
        expect(serialized[AccessionType.genbank]).toBe('B456');
        expect(serialized[AccessionType.sra]).toBe('C789');
        expect(serialized[AccessionType.gisaid]).toBe('D012');
    });

    test('should handle joining records of the same type', () => {
        const records = [
            { accession: 'A123', type: AccessionType.pathoplexus },
            { accession: 'B456', type: AccessionType.pathoplexus },
            { accession: 'C789', type: AccessionType.sra },
            { accession: 'D012', type: AccessionType.sra },
        ];

        const serialized = serializeRecordsToAccessionsInput(records, ',');

        expect(serialized[AccessionType.pathoplexus]).toBe('A123, B456');
        expect(serialized[AccessionType.sra]).toBe('C789, D012');
    });

    test('should handle empty records', () => {
        const serialized = serializeRecordsToAccessionsInput([]);

        expect(serialized[AccessionType.pathoplexus]).toBe('');
        expect(serialized[AccessionType.genbank]).toBe('');
        expect(serialized[AccessionType.sra]).toBe('');
        expect(serialized[AccessionType.gisaid]).toBe('');
    });
});

describe('parseRecordsFromAccessionInput', () => {
    test('should parse accessions input to records by type', () => {
        const accessions = {
            [AccessionType.pathoplexus]: 'A123',
            [AccessionType.genbank]: 'B456',
            [AccessionType.sra]: 'C789',
            [AccessionType.gisaid]: 'D012',
        };

        const records = parseRecordsFromAccessionInput(accessions);

        expect(records).toContainEqual({ accession: 'A123', type: AccessionType.pathoplexus });
        expect(records).toContainEqual({ accession: 'B456', type: AccessionType.genbank });
        expect(records).toContainEqual({ accession: 'C789', type: AccessionType.sra });
        expect(records).toContainEqual({ accession: 'D012', type: AccessionType.gisaid });
    });

    test('should handle splitting records of the same type', () => {
        const accessions = {
            [AccessionType.pathoplexus]: 'A123, B456',
            [AccessionType.genbank]: 'C789, D012',
            [AccessionType.sra]: '',
            [AccessionType.gisaid]: '',
        };

        const records = parseRecordsFromAccessionInput(accessions);

        expect(records).toContainEqual({ accession: 'A123', type: AccessionType.pathoplexus });
        expect(records).toContainEqual({ accession: 'B456', type: AccessionType.pathoplexus });
        expect(records).toContainEqual({ accession: 'C789', type: AccessionType.genbank });
        expect(records).toContainEqual({ accession: 'D012', type: AccessionType.genbank });
    });

    test('should handle empty accessions input', () => {
        const accessions = {
            [AccessionType.pathoplexus]: '',
            [AccessionType.genbank]: '',
            [AccessionType.sra]: '',
            [AccessionType.gisaid]: '',
        };

        const records = parseRecordsFromAccessionInput(accessions);

        expect(records).toHaveLength(0);
    });
});
