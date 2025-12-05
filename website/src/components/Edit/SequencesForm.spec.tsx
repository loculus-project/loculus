import { toast } from 'react-toastify';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { EditableSequences } from './SequencesForm';
import { defaultReviewData } from '../../../vitest.setup';
import { type ReferenceGenomesLightweightSchema, SINGLE_REFERENCE } from '../../types/referencesGenomes.ts';

function makeReferenceGenomeLightweightSchema(nucleotideSegmentNames: string[]): ReferenceGenomesLightweightSchema {
    return {
        [SINGLE_REFERENCE]: {
            nucleotideSegmentNames,
            geneNames: [],
            insdcAccessionFull: [],
        },
    };
}

function makeSubOrganismReferenceSchema(suborganisms: string[]): ReferenceGenomesLightweightSchema {
    const result: ReferenceGenomesLightweightSchema = {};

    for (const suborganism of suborganisms) {
        result[suborganism] = {
            nucleotideSegmentNames: ['main'],
            geneNames: [],
            insdcAccessionFull: [],
        };
    }

    return result;
}

/* eslint-disable @typescript-eslint/naming-convention -- this test has keys that expectedly contain spaces */
describe('SequencesForm', () => {
    beforeEach(() => {
        vi.spyOn(toast, 'error');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });
    test('Empty editable sequences produces no output', () => {
        const emptyEditableSequences = EditableSequences.fromSequenceNames(
            makeReferenceGenomeLightweightSchema(['foo', 'bar']),
        );

        expect(emptyEditableSequences.getSequenceFasta()).toBeUndefined();
        expect(emptyEditableSequences.getSequenceRecord()).deep.equals({});
    });

    test('GIVEN organism with 2 suborganisms with 1 segment each THEN allows at max 1 inputs', async () => {
        let editableSequences = EditableSequences.fromSequenceNames(
            makeSubOrganismReferenceSchema(['suborg1', 'suborg2']),
        );
        const initialRows = editableSequences.rows;
        expect(initialRows).toEqual([
            { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
        ]);
        const firstKey = initialRows[0].key;
        {
            editableSequences = editableSequences.update(firstKey, 'ATCG', 'Segment 1', 'subId_Segment1');
            const fasta = editableSequences.getSequenceFasta();
            expect(fasta).not.toBeUndefined();
            const fastaText = await fasta!.text();
            expect.soft(fastaText).toBe('>subId_Segment1\nATCG');
            expect(editableSequences.getSequenceRecord()).deep.equals({ subId_Segment1: 'ATCG' });

            const rows = editableSequences.rows;
            expect(rows).toEqual([
                { label: 'Segment 1', value: 'ATCG', initialValue: null, key: firstKey, fastaHeader: 'subId_Segment1' },
            ]);
        }
        expect(() => editableSequences.update('another key', 'GG', 'another key', 'subId_anotherkey')).toThrowError(
            'Maximum limit reached — you can add up to 1 sequence file(s) only.',
        );
        editableSequences = editableSequences.update(firstKey, null, null, null);
        expect(editableSequences.rows).toEqual([
            { label: 'Add a segment', value: null, fastaHeader: null, initialValue: null, key: expect.any(String) },
        ]);
        const rowsAfterDeletion = editableSequences.rows;
        const newFirstKey = rowsAfterDeletion[0].key;
        {
            editableSequences = editableSequences.update(newFirstKey, 'ATCG', 'Segment 1', 'subId_Segment1');
            const fasta = editableSequences.getSequenceFasta();
            expect(fasta).not.toBeUndefined();
            const fastaText = await fasta!.text();
            expect.soft(fastaText).toBe('>subId_Segment1\nATCG');
            expect(editableSequences.getSequenceRecord()).deep.equals({ subId_Segment1: 'ATCG' });

            const rows = editableSequences.rows;
            expect(rows).toEqual([
                {
                    label: 'Segment 1',
                    value: 'ATCG',
                    initialValue: null,
                    key: newFirstKey,
                    fastaHeader: 'subId_Segment1',
                },
            ]);
            expect(editableSequences.getFastaIds()).toEqual('subId_Segment1');
        }
    });

    test('GIVEN organism with 2 segments THEN allows at max 2 inputs', async () => {
        let editableSequences = EditableSequences.fromSequenceNames(
            makeReferenceGenomeLightweightSchema(['foo', 'bar']),
        );

        const initialRows = editableSequences.rows;
        expect(initialRows).toEqual([
            { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
        ]);
        const firstKey = initialRows[0].key;

        let secondKey;
        {
            editableSequences = editableSequences.update(firstKey, 'ATCG', 'Segment 1', 'subId_Segment1 description');
            const fasta = editableSequences.getSequenceFasta();
            expect(fasta).not.toBeUndefined();
            const fastaText = await fasta!.text();
            expect.soft(fastaText).toBe('>subId_Segment1 description\nATCG');
            expect(editableSequences.getSequenceRecord()).deep.equals({ 'subId_Segment1 description': 'ATCG' });

            const rows = editableSequences.rows;
            expect(rows).toEqual([
                {
                    label: 'Segment 1',
                    value: 'ATCG',
                    initialValue: null,
                    fastaHeader: 'subId_Segment1 description',
                    key: firstKey,
                },
                { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
            ]);
            secondKey = rows[1].key;
        }

        {
            editableSequences = editableSequences.update(secondKey, 'TT', 'Segment 2', 'subId_Segment2');
            const fasta = editableSequences.getSequenceFasta();
            expect(fasta).not.toBeUndefined();
            const fastaText = await fasta!.text();
            expect.soft(fastaText).toBe('>subId_Segment1 description\nATCG\n>subId_Segment2\nTT');
            expect(editableSequences.getSequenceRecord()).deep.equals({
                'subId_Segment1 description': 'ATCG',
                'subId_Segment2': 'TT',
            });

            const rows = editableSequences.rows;
            expect(rows).deep.equals([
                {
                    label: 'Segment 1',
                    value: 'ATCG',
                    initialValue: null,
                    key: firstKey,
                    fastaHeader: 'subId_Segment1 description',
                },
                { label: 'Segment 2', value: 'TT', initialValue: null, key: secondKey, fastaHeader: 'subId_Segment2' },
            ]);
        }

        expect(() => editableSequences.update('another key', 'GG', 'another key', 'anything')).toThrowError(
            'Maximum limit reached — you can add up to 2 sequence file(s) only.',
        );
        expect(editableSequences.getFastaIds()).toEqual('subId_Segment1 subId_Segment2');
    });

    test('GIVEN a multi-segmented organism THEN do not allow duplicate fasta headers', () => {
        let editableSequences = EditableSequences.fromSequenceNames(
            makeReferenceGenomeLightweightSchema(['foo', 'bar']),
        );

        const initialRows = editableSequences.rows;
        expect(initialRows).toEqual([
            { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
        ]);
        const firstKey = initialRows[0].key;

        editableSequences = editableSequences.update(firstKey, 'ATCG', 'Segment 1', 'subId_Segment');
        const rowsAfterFirstUpdate = editableSequences.rows;
        const secondKey = rowsAfterFirstUpdate[1].key;

        editableSequences = editableSequences.update(secondKey, 'TT', 'Segment 2', 'subId_Segment description');

        const errorMessage = 'A sequence with the fastaID subId_Segment already exists.';
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining(errorMessage));

        // Expect that the second sequence was not added
        expect(editableSequences.rows).toEqual([
            { label: 'Segment 1', value: 'ATCG', initialValue: null, key: firstKey, fastaHeader: 'subId_Segment' },
            { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
        ]);
        expect(editableSequences.getFastaIds()).toEqual('subId_Segment');
    });

    test('GIVEN a single-segmented organism THEN only allows 1 input', async () => {
        let editableSequences = EditableSequences.fromSequenceNames(makeReferenceGenomeLightweightSchema(['foo']));

        const initialRows = editableSequences.rows;
        expect(initialRows).toEqual([
            { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
        ]);
        const key = initialRows[0].key;

        editableSequences = editableSequences.update(key, 'ATCG', key, 'subId');
        const fasta = editableSequences.getSequenceFasta();
        expect(fasta).not.toBeUndefined();
        const fastaText = await fasta!.text();
        expect.soft(fastaText).toBe('>subId\nATCG');

        expect(editableSequences.getSequenceRecord()).deep.equals({ subId: 'ATCG' });

        const rows = editableSequences.rows;
        expect(rows).deep.equals([{ label: key, value: 'ATCG', initialValue: null, fastaHeader: 'subId', key }]);

        expect(() => editableSequences.update('another key', 'GG', 'another key', 'anything')).toThrowError(
            'Maximum limit reached — you can add up to 1 sequence file(s) only.',
        );
    });

    test('GIVEN an edit with an empty fasta header THEN use key as fasta header', async () => {
        let editableSequences = EditableSequences.fromSequenceNames(makeReferenceGenomeLightweightSchema(['foo']));

        const initialRows = editableSequences.rows;
        expect(initialRows).toEqual([
            { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
        ]);
        const key = initialRows[0].key;

        editableSequences = editableSequences.update(key, 'ATCG', 'subId', null);
        const fasta = editableSequences.getSequenceFasta();
        expect(fasta).not.toBeUndefined();
        const fastaText = await fasta!.text();
        expect.soft(fastaText).toBe(`>${key}\nATCG`);

        expect(editableSequences.getSequenceRecord()).deep.equals({ [key]: 'ATCG' });

        const rows = editableSequences.rows;
        expect(rows).deep.equals([{ label: "subId", value: 'ATCG', initialValue: null, fastaHeader: key, key }]);

        expect(() => editableSequences.update('another key', 'GG', 'another key', 'anything')).toThrowError(
            'Maximum limit reached — you can add up to 1 sequence file(s) only.',
        );
    });

    test('GIVEN no initial data WHEN I add and remove a sequence THEN input is also removed again', () => {
        let editableSequences = EditableSequences.fromSequenceNames(
            makeReferenceGenomeLightweightSchema(['foo', 'bar']),
        );

        const key = editableSequences.rows[0].key;

        editableSequences = editableSequences.update(key, 'ATCG', key, key);
        expect(editableSequences.rows).toEqual([
            { label: key, value: 'ATCG', initialValue: null, key, fastaHeader: key },
            { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
        ]);

        editableSequences = editableSequences.update(key, null, null, null);
        expect(editableSequences.rows).toEqual([
            { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
        ]);
        expect(editableSequences.getFastaIds()).toEqual('');
    });

    test('GIVEN initial data with an empty segment THEN the fasta does not contain the empty segment', async () => {
        let editableSequences = EditableSequences.fromInitialData(
            defaultReviewData,
            makeReferenceGenomeLightweightSchema(['originalSequenceName', 'anotherSequenceName']),
        );
        editableSequences = editableSequences.update(editableSequences.rows[0].key, 'ATCG', 'label', 'subId_label');
        const fasta = editableSequences.getSequenceFasta();
        expect(fasta).not.toBeUndefined();
        const fastaText = await fasta!.text();
        expect.soft(fastaText).toBe('>subId_label\nATCG');

        expect(editableSequences.getSequenceRecord()).deep.equals({ subId_label: 'ATCG' });
        expect(editableSequences.getFastaIds()).toEqual('subId_label');
    });

    test('GIVEN initial segment data that is then deleted as an edit THEN the edit record does not contain the segment key but input field is kept', () => {
        let editableSequences = EditableSequences.fromInitialData(
            defaultReviewData,
            makeReferenceGenomeLightweightSchema(['originalSequenceName', 'anotherSequenceName']),
        );

        expect(editableSequences.rows).toEqual([
            {
                label: 'originalFastaHeader (mapped to unalignedProcessedSequenceName)',
                fastaHeader: 'originalFastaHeader',
                value: 'originalUnalignedNucleotideSequencesValue',
                initialValue: 'originalUnalignedNucleotideSequencesValue',
                key: expect.any(String),
            },
            { label: 'Add a segment', value: null, initialValue: null, key: expect.any(String), fastaHeader: null },
        ]);

        editableSequences = editableSequences.update(editableSequences.rows[0].key, null, null, null);
        const fasta = editableSequences.getSequenceFasta();
        expect(fasta).toBeUndefined();

        expect(editableSequences.getSequenceRecord()).deep.equals({});

        expect(editableSequences.rows).toEqual([
            {
                label: 'Add a segment',
                value: null,
                fastaHeader: null,
                initialValue: null,
                key: expect.any(String),
            },
        ]);
        expect(editableSequences.getFastaIds()).toEqual('');
    });
});
