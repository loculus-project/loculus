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
        expect(initialRows).toEqual([{ label: '+ add new sequence', value: null, key: expect.any(String) }]);
        const firstKey = initialRows[0].key;

        let secondKey;
        {
            editableSequences = editableSequences.update(firstKey, 'ATCG');
            const fasta = editableSequences.getSequenceFasta('subId');
            expect(fasta).not.toBeUndefined();
            const fastaText = await fasta!.text();
            expect.soft(fastaText).toBe('>subId_Segment1\nATCG');
            expect(editableSequences.getSequenceRecord()).deep.equals({ 'Segment 1': 'ATCG' });

            const rows = editableSequences.rows;
            expect(rows).toEqual([
                { label: 'Segment 1', value: 'ATCG', key: firstKey },
                { label: '+ add new sequence', value: null, key: expect.any(String) },
            ]);
            secondKey = rows[1].key;
        }

        {
            editableSequences = editableSequences.update(secondKey, 'TT');
            const fasta = editableSequences.getSequenceFasta('subId');
            expect(fasta).not.toBeUndefined();
            const fastaText = await fasta!.text();
            expect.soft(fastaText).toBe('>subId_Segment1\nATCG\n>subId_Segment2\nTT');
            expect(editableSequences.getSequenceRecord()).deep.equals({ 'Segment 1': 'ATCG', 'Segment 2': 'TT' });

            const rows = editableSequences.rows;
            expect(rows).deep.equals([
                { label: 'Segment 1', value: 'ATCG', key: firstKey },
                { label: 'Segment 2', value: 'TT', key: secondKey },
            ]);
        }

        expect(() => editableSequences.update('another key', 'GG')).toThrowError(
            'Must not add more than 2 sequence file(s).',
        );
    });

    test('GIVEN a single-segmented organism THEN only allows 1 input and fasta header does not contain the segment name', async () => {
        let editableSequences = EditableSequences.fromSequenceNames(makeReferenceGenomeLightweightSchema(['foo']));

        const initialRows = editableSequences.rows;
        expect(initialRows).toEqual([{ label: '+ add new sequence', value: null, key: expect.any(String) }]);
        const key = initialRows[0].key;

        editableSequences = editableSequences.update(key, 'ATCG');
        const fasta = editableSequences.getSequenceFasta('subId');
        expect(fasta).not.toBeUndefined();
        const fastaText = await fasta!.text();
        expect.soft(fastaText).toBe('>subId\nATCG');

        expect(editableSequences.getSequenceRecord()).deep.equals({ 'Segment 1': 'ATCG' });

        const rows = editableSequences.rows;
        expect(rows).deep.equals([{ label: 'Segment 1', value: 'ATCG', key }]);

        expect(() => editableSequences.update('another key', 'GG')).toThrowError(
            'Must not add more than 1 sequence file(s).',
        );
    });

    test('GIVEN no initial data WHEN I add and remove a sequence THEN input is also removed again', () => {
        let editableSequences = EditableSequences.fromSequenceNames(
            makeReferenceGenomeLightweightSchema(['foo', 'bar']),
        );

        const key = editableSequences.rows[0].key;

        editableSequences = editableSequences.update(key, 'ATCG');
        expect(editableSequences.rows).toEqual([
            { label: 'Segment 1', value: 'ATCG', key },
            { label: '+ add new sequence', value: null, key: expect.any(String) },
        ]);

        editableSequences = editableSequences.update(key, null);
        expect(editableSequences.rows).toEqual([{ label: '+ add new sequence', value: null, key: expect.any(String) }]);
    });

    test('GIVEN initial data with an empty segment THEN the fasta does not contain the empty segment', async () => {
        let editableSequences = EditableSequences.fromInitialData(
            defaultReviewData,
            makeReferenceGenomeLightweightSchema(['originalSequenceName', 'anotherSequenceName']),
        );
        editableSequences = editableSequences.update(editableSequences.rows[0].key, 'ATCG');
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

        expect(editableSequences.rows).toEqual([
            {
                label: 'originalSequenceName segment',
                value: 'originalUnalignedNucleotideSequencesValue',
                key: expect.any(String),
            },
            { label: '+ add new sequence', value: null, key: expect.any(String) },
        ]);

        editableSequences = editableSequences.update(editableSequences.rows[0].key, null);
        const fasta = editableSequences.getSequenceFasta('subId');
        expect(fasta).toBeUndefined();

        expect(editableSequences.getSequenceRecord()).deep.equals({});

        expect(editableSequences.rows).toEqual([
            { label: 'originalSequenceName segment', value: null, key: expect.any(String) },
            { label: '+ add new sequence', value: null, key: expect.any(String) },
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
