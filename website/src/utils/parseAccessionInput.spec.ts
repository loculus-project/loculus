import { expect, test, describe } from 'vitest';

import { serializeSeqSetRecords, deserializeAccessionInput } from './parseAccessionInput';
import { SeqSetRecordType } from '../types/seqSetCitation';

describe('parseAccessionInput', () => {
    describe('serializeSeqSetRecords', () => {
        test('should deserialize empty records', () => {
            const deserialized = serializeSeqSetRecords([]);
            expect(deserialized).toBe('');
        });

        test('should deserialize multiple records to accessions input', () => {
            const records = [
                { accession: 'A123', type: SeqSetRecordType.loculus, isFocal: true },
                { accession: 'B456', type: SeqSetRecordType.loculus, isFocal: true },
            ];
            const deserialized = serializeSeqSetRecords(records, true);
            expect(deserialized).toBe('A123, B456');
        });

        test('should deserialize record by isFocal key', () => {
            const records = [
                { accession: 'A123', type: SeqSetRecordType.loculus, isFocal: true },
                { accession: 'B456', type: SeqSetRecordType.loculus, isFocal: false },
            ];

            const deserializedFocal = serializeSeqSetRecords(records, true);
            expect(deserializedFocal).toBe('A123');

            const deserializedBackground = serializeSeqSetRecords(records, false);
            expect(deserializedBackground).toBe('B456');
        });
    });

    describe('deserializeAccessionInput', () => {
        test('should serialize empty input', () => {
            const serialized = deserializeAccessionInput('', true, SeqSetRecordType.loculus);
            expect(serialized).toEqual([]);
        });

        test('should serialize multiple accessions', () => {
            const serialized = deserializeAccessionInput('A123, B456', true, SeqSetRecordType.loculus);
            expect(serialized).toEqual([
                { accession: 'A123', type: SeqSetRecordType.loculus, isFocal: true },
                { accession: 'B456', type: SeqSetRecordType.loculus, isFocal: true },
            ]);
        });

        test('should serialize accession with correct isFocal key', () => {
            const serializedFocal = deserializeAccessionInput('A123, B456', true, SeqSetRecordType.loculus);
            expect(serializedFocal).toEqual([
                { accession: 'A123', type: SeqSetRecordType.loculus, isFocal: true },
                { accession: 'B456', type: SeqSetRecordType.loculus, isFocal: true },
            ]);

            const serializedBackground = deserializeAccessionInput('A123, B456', false, SeqSetRecordType.loculus);
            expect(serializedBackground).toEqual([
                { accession: 'A123', type: SeqSetRecordType.loculus, isFocal: false },
                { accession: 'B456', type: SeqSetRecordType.loculus, isFocal: false },
            ]);
        });
    });
});
