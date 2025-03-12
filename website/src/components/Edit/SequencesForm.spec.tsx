import { describe, expect, test } from 'vitest';

import { EditableSequences } from './SequencesForm';

describe('InputForm', () => {
    test('Empty editable sequences produces `undefined`', () => {
        const emptyEditableSequences = EditableSequences.empty();
        expect(emptyEditableSequences.getSequenceFasta('subId')).toBeUndefined();
    });

    test('Empty editable sequences (with names only) produces `undefined`', () => {
        const emptyEditableSequences = EditableSequences.fromSequenceNames(['foo', 'bar']);
        expect(emptyEditableSequences.getSequenceFasta('subId')).toBeUndefined();
    });

    test('GIVEN only a single segment has data THEN the fasta has only that segment', async () => {
        let editableSequences = EditableSequences.fromSequenceNames(['foo', 'bar']);
        editableSequences = editableSequences.update({ key: 'foo', value: 'ATCG' });
        const fasta = editableSequences.getSequenceFasta('subId');
        expect(fasta).not.toBeUndefined();
        const fastaText = await fasta!.text();
        expect(fastaText).toBe('>subId_foo\nATCG');
    });
});
