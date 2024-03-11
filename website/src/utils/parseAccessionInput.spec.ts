import { expect, test, describe } from 'vitest';

import { serializeRecordsToAccessionsInput } from './parseAccessionInput';
import { DatasetRecordType } from '../types/datasetCitation';

describe('serializeRecordsToAccessionsInput', () => {
    test('should serialize records to accessions input by type', () => {
        const records = [{ accession: 'A123', type: DatasetRecordType.loculus }];

        const serialized = serializeRecordsToAccessionsInput(records, ',');

        expect(serialized[DatasetRecordType.loculus]).toBe('A123');
    });

    test('should handle joining records of the same type', () => {
        const records = [
            { accession: 'A123', type: DatasetRecordType.loculus },
            { accession: 'B456', type: DatasetRecordType.loculus },
        ];

        const serialized = serializeRecordsToAccessionsInput(records, ',');

        expect(serialized[DatasetRecordType.loculus]).toBe('A123, B456');
    });

    test('should handle empty records', () => {
        const serialized = serializeRecordsToAccessionsInput([]);

        expect(serialized[DatasetRecordType.loculus]).toBe('');
    });
});
