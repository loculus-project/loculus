import { describe, expect, test } from 'vitest';

import { EditableSequences } from './SequencesForm';
import { defaultReviewData } from '../../../vitest.setup';

describe('SequencesForm', () => {
    test('Empty editable sequences (with names only) produces `undefined`', () => {
        const emptyEditableSequences = EditableSequences.fromSequenceNames(['foo', 'bar']);
        expect(emptyEditableSequences.getSequenceFasta('subId')).toBeUndefined();
    });

    test('GIVEN a multi-segmented organism and only a single segment has data THEN the fasta has only that segment', async () => {
        let editableSequences = EditableSequences.fromSequenceNames(['foo', 'bar']);
        editableSequences = editableSequences.update({ key: 'foo', value: 'ATCG' });
        const fasta = editableSequences.getSequenceFasta('subId');
        expect(fasta).not.toBeUndefined();
        const fastaText = await fasta!.text();
        expect.soft(fastaText).toBe('>subId_foo\nATCG');

        const sequenceRecord = Object.entries(editableSequences.getSequenceRecord());
        expect(sequenceRecord.length).toBe(1);
        expect(sequenceRecord[0]).toStrictEqual(['foo', 'ATCG']);
    });

    test('GIVEN a single-segmented organism with segment data THEN the fasta header does not contain the segment name', async () => {
        let editableSequences = EditableSequences.fromSequenceNames(['foo']);
        editableSequences = editableSequences.update({ key: 'foo', value: 'ATCG' });
        const fasta = editableSequences.getSequenceFasta('subId');
        expect(fasta).not.toBeUndefined();
        const fastaText = await fasta!.text();
        expect.soft(fastaText).toBe('>subId\nATCG');

        const sequenceRecord = Object.entries(editableSequences.getSequenceRecord());
        expect(sequenceRecord.length).toBe(1);
        expect(sequenceRecord[0]).toStrictEqual(['foo', 'ATCG']);
    });

    test('GIVEN initial data with an empty segment THEN the fasta does not contain the empty segment', async () => {
        let editableSequences = EditableSequences.fromInitialData(defaultReviewData, [
            'originalSequenceName',
            'anotherSequenceName',
        ]);
        editableSequences = editableSequences.update({ key: 'originalSequenceName', value: 'ATCG' });
        const fasta = editableSequences.getSequenceFasta('subId');
        expect(fasta).not.toBeUndefined();
        const fastaText = await fasta!.text();
        expect.soft(fastaText).toBe('>subId_originalSequenceName\nATCG');

        const sequenceRecord = Object.entries(editableSequences.getSequenceRecord());
        expect(sequenceRecord.length).toBe(1);
        expect(sequenceRecord[0]).toStrictEqual(['originalSequenceName', 'ATCG']);
    });

    test('GIVEN initial segment data that is then deleted as an edit THEN the edit record does not contain the segment key', async () => {
        let editableSequences = EditableSequences.fromInitialData(defaultReviewData, [
            'originalSequenceName',
            'anotherSequenceName',
        ]);
        editableSequences = editableSequences.update({ key: 'originalSequenceName', value: '' });
        const fasta = editableSequences.getSequenceFasta('subId');
        expect(fasta).toBeUndefined();

        const sequenceRecord = Object.entries(editableSequences.getSequenceRecord());
        expect(sequenceRecord.length).toBe(0);
    });
});
