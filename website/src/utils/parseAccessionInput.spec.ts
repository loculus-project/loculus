import { expect, test, describe } from 'vitest';

import { serializeRecordsToAccessionsInput } from './parseAccessionInput';
import { SeqSetRecordType } from '../types/seqSetCitation';

describe('serializeRecordsToAccessionsInput', () => {
    test('should serialize records to accessions input by type', () => {
        const records = [{ accession: 'A123', type: SeqSetRecordType.loculus }];

        const serialized = serializeRecordsToAccessionsInput(records, ',');

        expect(serialized[SeqSetRecordType.loculus]).toBe('A123');
    });

    test('should handle joining records of the same type', () => {
        const records = [
            { accession: 'A123', type: SeqSetRecordType.loculus },
            { accession: 'B456', type: SeqSetRecordType.loculus },
        ];

        const serialized = serializeRecordsToAccessionsInput(records, ',');

        expect(serialized[SeqSetRecordType.loculus]).toBe('A123, B456');
    });

    test('should handle empty records', () => {
        const serialized = serializeRecordsToAccessionsInput([]);

        expect(serialized[SeqSetRecordType.loculus]).toBe('');
    });
});
