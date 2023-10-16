import { expect, test, describe } from 'vitest';

import { serializeRecordsToAccessionsInput, parseRecordsFromAccessionInput } from './parseAccessionInput';
import { AccessionType, type DatasetRecord } from '../types';

describe('serializeRecordsToAccessionsInput', () => {
    test('should serialize records to accessions input', () => {
        const records = [
            { accession: 'A123', type: AccessionType.pathoplexus },
            { accession: 'B456', type: AccessionType.genbank },
            { accession: 'C789', type: AccessionType.sra },
            { accession: 'D012', type: AccessionType.gisaid },
        ];

        const serialized = serializeRecordsToAccessionsInput(records as unknown as DatasetRecord[], ',');

        expect(serialized[AccessionType.pathoplexus]).toBe('A123');
        expect(serialized[AccessionType.genbank]).toBe('B456');
        expect(serialized[AccessionType.sra]).toBe('C789');
        expect(serialized[AccessionType.gisaid]).toBe('D012');
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
    test('should parse accessions input to records', () => {
        const accessions = {
            [AccessionType.pathoplexus]: 'A123, B456',
            [AccessionType.genbank]: 'C789',
            [AccessionType.sra]: 'D012',
            [AccessionType.gisaid]: 'E345, F678',
        };

        const records = parseRecordsFromAccessionInput(accessions);

        expect(records).toContainEqual({ accession: 'A123', type: AccessionType.pathoplexus });
        expect(records).toContainEqual({ accession: 'B456', type: AccessionType.pathoplexus });
        expect(records).toContainEqual({ accession: 'C789', type: AccessionType.genbank });
        expect(records).toContainEqual({ accession: 'D012', type: AccessionType.sra });
        expect(records).toContainEqual({ accession: 'E345', type: AccessionType.gisaid });
        expect(records).toContainEqual({ accession: 'F678', type: AccessionType.gisaid });
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
