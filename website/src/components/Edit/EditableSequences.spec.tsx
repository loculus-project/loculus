import { describe, expect, test } from 'vitest';

import { EditableSequences } from './EditableSequences.ts';
import { defaultReviewData } from '../../../vitest.setup';
import { type ReferenceGenomesLightweightSchema, SINGLE_REFERENCE } from '../../types/referencesGenomes.ts';

/* eslint-disable @typescript-eslint/naming-convention -- this test frequently has keys that expectedly contain spaces */
describe('EditableSequences', () => {
    test('Empty editable sequences produces no output', () => {
        const emptyEditableSequences = EditableSequences.fromSequenceNames(
            makeReferenceGenomeLightweightSchema(['foo', 'bar']),
        );

        expect(emptyEditableSequences.getSequenceFasta('subId')).toBeUndefined();
        expect(emptyEditableSequences.getSequenceRecord()).deep.equals({});
    });

    test('GIVEN organism with 2 segments THEN allows at max 2 inputs', async () => {
        let editableSequences = EditableSequences.fromSequenceNames(
            makeReferenceGenomeLightweightSchema(['foo', 'bar']),
        );

        const initialRows = editableSequences.rows;
        expect(initialRows).deep.equals([{ label: '+ add new sequence', value: null }]);

        {
            editableSequences = editableSequences.update(0, 'ATCG');
            const fasta = editableSequences.getSequenceFasta('subId');
            expect(fasta).not.toBeUndefined();
            const fastaText = await fasta!.text();
            expect.soft(fastaText).toBe('>subId_Segment1\nATCG');
            expect(editableSequences.getSequenceRecord()).deep.equals({ 'Segment 1': 'ATCG' });

            const rows = editableSequences.rows;
            expect(rows).deep.equals([
                { label: 'Segment 1', value: 'ATCG' },
                { label: '+ add new sequence', value: null },
            ]);
        }

        {
            editableSequences = editableSequences.update(1, 'TT');
            const fasta = editableSequences.getSequenceFasta('subId');
            expect(fasta).not.toBeUndefined();
            const fastaText = await fasta!.text();
            expect.soft(fastaText).toBe('>subId_Segment1\nATCG\n>subId_Segment2\nTT');
            expect(editableSequences.getSequenceRecord()).deep.equals({ 'Segment 1': 'ATCG', 'Segment 2': 'TT' });

            const rows = editableSequences.rows;
            expect(rows).deep.equals([
                { label: 'Segment 1', value: 'ATCG' },
                { label: 'Segment 2', value: 'TT' },
            ]);
        }

        expect(() => editableSequences.update(2, 'GG')).toThrowError(
            'Index 2 is out of bounds for max number of rows 2',
        );
    });

    test('GIVEN a single-segmented organism THEN only allows 1 input and fasta header does not contain the segment name', async () => {
        let editableSequences = EditableSequences.fromSequenceNames(makeReferenceGenomeLightweightSchema(['foo']));

        const initialRows = editableSequences.rows;
        expect(initialRows).deep.equals([{ label: '+ add new sequence', value: null }]);

        editableSequences = editableSequences.update(0, 'ATCG');
        const fasta = editableSequences.getSequenceFasta('subId');
        expect(fasta).not.toBeUndefined();
        const fastaText = await fasta!.text();
        expect.soft(fastaText).toBe('>subId\nATCG');

        expect(editableSequences.getSequenceRecord()).deep.equals({ 'Segment 1': 'ATCG' });

        const rows = editableSequences.rows;
        expect(rows).deep.equals([{ label: 'Segment 1', value: 'ATCG' }]);

        expect(() => editableSequences.update(1, 'GG')).toThrowError(
            'Index 1 is out of bounds for max number of rows 1',
        );
    });

    test('GIVEN no initial data WHEN I add and remove a sequence THEN input is also removed again', () => {
        let editableSequences = EditableSequences.fromSequenceNames(
            makeReferenceGenomeLightweightSchema(['foo', 'bar']),
        );

        editableSequences = editableSequences.update(0, 'ATCG');
        expect(editableSequences.rows).deep.equals([
            { label: 'Segment 1', value: 'ATCG' },
            { label: '+ add new sequence', value: null },
        ]);

        editableSequences = editableSequences.update(0, null);
        expect(editableSequences.rows).deep.equals([{ label: '+ add new sequence', value: null }]);
    });

    test('GIVEN initial data with an empty segment THEN the fasta does not contain the empty segment', async () => {
        let editableSequences = EditableSequences.fromInitialData(
            defaultReviewData,
            makeReferenceGenomeLightweightSchema(['originalSequenceName', 'anotherSequenceName']),
        );
        editableSequences = editableSequences.update(0, 'ATCG');
        const fasta = editableSequences.getSequenceFasta('subId');
        expect(fasta).not.toBeUndefined();
        const fastaText = await fasta!.text();
        expect.soft(fastaText).toBe('>subId_originalSequenceNamesegment\nATCG');

        expect(editableSequences.getSequenceRecord()).deep.equals({ 'originalSequenceName segment': 'ATCG' });
    });

    test('GIVEN initial segment data that is then deleted as an edit THEN the edit record does not contain the segment key but input field is kept', () => {
        let editableSequences = EditableSequences.fromInitialData(
            defaultReviewData,
            makeReferenceGenomeLightweightSchema(['originalSequenceName', 'anotherSequenceName']),
        );

        expect(editableSequences.rows).deep.equals([
            { label: 'originalSequenceName segment', value: 'originalUnalignedNucleotideSequencesValue' },
            { label: '+ add new sequence', value: null },
        ]);

        editableSequences = editableSequences.update(0, null);
        const fasta = editableSequences.getSequenceFasta('subId');
        expect(fasta).toBeUndefined();

        expect(editableSequences.getSequenceRecord()).deep.equals({});

        expect(editableSequences.rows).deep.equals([
            { label: 'originalSequenceName segment', value: null },
            { label: '+ add new sequence', value: null },
        ]);
    });
});

function makeReferenceGenomeLightweightSchema(nucleotideSegmentNames: string[]): ReferenceGenomesLightweightSchema {
    return {
        [SINGLE_REFERENCE]: {
            nucleotideSegmentNames,
            geneNames: [],
            insdcAccessionFull: [],
        },
    };
}
