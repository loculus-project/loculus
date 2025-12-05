import { toast } from 'react-toastify';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { EditableSequences } from './SequencesForm';
import {
    defaultReviewData,
    originalFastaHeader,
    originalUnalignedNucleotideSequenceValue,
    unalignedProcessedSequenceName,
} from '../../../vitest.setup';

const FASTAHEADER = 'FASTAHEADER';
const FASTAHEADER_WITH_DESCRIPTION = `${FASTAHEADER} description`;
const OTHER_FASTAHEADER = 'FASTAHEADER_2';
const SEQUENCE = 'ATCG';
const OTHER_SEQUENCE = 'GGTA';
const LABEL = 'Segment 1';
const OTHER_LABEL = 'Segment 2';

describe('SequencesForm', () => {
    beforeEach(() => {
        vi.spyOn(toast, 'error');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });
    test('Empty editable sequences produces no output', () => {
        const MAX_SEQUENCES_PER_ENTRY = 1;
        const emptyEditableSequences = EditableSequences.empty(MAX_SEQUENCES_PER_ENTRY);

        expect(emptyEditableSequences.getSequenceFasta()).toBeUndefined();
        expect(emptyEditableSequences.getSequenceRecord()).deep.equals({});
    });

    test('GIVEN organism with MAX_SEQUENCES_PER_ENTRY is 1 THEN allows at max 1 inputs', async () => {
        const MAX_SEQUENCES_PER_ENTRY = 1;
        let editableSequences = EditableSequences.empty(MAX_SEQUENCES_PER_ENTRY);
        const initialRows = editableSequences.rows;
        expect(initialRows).toEqual([
            { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
        ]);
        const firstKey = initialRows[0].key;
        {
            editableSequences = editableSequences.update(firstKey, SEQUENCE, LABEL, FASTAHEADER);
            const fasta = editableSequences.getSequenceFasta();
            expect(fasta).not.toBeUndefined();
            const fastaText = await fasta!.text();
            expect.soft(fastaText).toBe(`>${FASTAHEADER}\n${SEQUENCE}`);
            expect(editableSequences.getSequenceRecord()).deep.equals({ [FASTAHEADER]: SEQUENCE });

            const rows = editableSequences.rows;
            expect(rows).toEqual([
                { label: LABEL, value: SEQUENCE, initialValue: null, key: firstKey, fastaHeader: FASTAHEADER },
            ]);
        }

        expect(() =>
            editableSequences.update('another key', 'GG', 'another key', 'FASTAHEADER_anotherkey'),
        ).toThrowError('Maximum limit reached — you can add up to 1 sequence file(s) only.');
        editableSequences = editableSequences.update(firstKey, null, null, null);
        expect(editableSequences.rows).toEqual([
            { label: 'Add a segment', value: null, fastaHeader: null, initialValue: null, key: expect.any(String) },
        ]);
        const rowsAfterDeletion = editableSequences.rows;
        const newFirstKey = rowsAfterDeletion[0].key;
        {
            editableSequences = editableSequences.update(newFirstKey, SEQUENCE, LABEL, FASTAHEADER);
            const fasta = editableSequences.getSequenceFasta();
            expect(fasta).not.toBeUndefined();
            const fastaText = await fasta!.text();
            expect.soft(fastaText).toBe(`>${FASTAHEADER}\n${SEQUENCE}`);
            expect(editableSequences.getSequenceRecord()).deep.equals({ [FASTAHEADER]: SEQUENCE });

            const rows = editableSequences.rows;
            expect(rows).toEqual([
                {
                    label: LABEL,
                    value: SEQUENCE,
                    initialValue: null,
                    key: newFirstKey,
                    fastaHeader: FASTAHEADER,
                },
            ]);
            expect(editableSequences.getFastaIds()).toEqual(FASTAHEADER);
        }
    });

    test('GIVEN organism with MAX_SEQUENCES_PER_ENTRY is 2 THEN allows at max 2 inputs', async () => {
        const MAX_SEQUENCES_PER_ENTRY = 2;
        let editableSequences = EditableSequences.empty(MAX_SEQUENCES_PER_ENTRY);

        const initialRows = editableSequences.rows;
        expect(initialRows).toEqual([
            { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
        ]);
        const firstKey = initialRows[0].key;

        let secondKey;
        {
            editableSequences = editableSequences.update(firstKey, SEQUENCE, LABEL, FASTAHEADER);
            const fasta = editableSequences.getSequenceFasta();
            expect(fasta).not.toBeUndefined();
            const fastaText = await fasta!.text();
            expect.soft(fastaText).toBe(`>${FASTAHEADER}\n${SEQUENCE}`);
            expect(editableSequences.getSequenceRecord()).deep.equals({ [FASTAHEADER]: SEQUENCE });

            const rows = editableSequences.rows;
            expect(rows).toEqual([
                {
                    label: LABEL,
                    value: SEQUENCE,
                    initialValue: null,
                    fastaHeader: FASTAHEADER,
                    key: firstKey,
                },
                { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
            ]);
            secondKey = rows[1].key;
        }

        {
            editableSequences = editableSequences.update(secondKey, OTHER_SEQUENCE, OTHER_LABEL, OTHER_FASTAHEADER);
            const fasta = editableSequences.getSequenceFasta();
            expect(fasta).not.toBeUndefined();
            const fastaText = await fasta!.text();
            expect.soft(fastaText).toBe(`>${FASTAHEADER}\n${SEQUENCE}\n>${OTHER_FASTAHEADER}\n${OTHER_SEQUENCE}`);
            expect(editableSequences.getSequenceRecord()).deep.equals({
                [FASTAHEADER]: SEQUENCE,
                [OTHER_FASTAHEADER]: OTHER_SEQUENCE,
            });

            const rows = editableSequences.rows;
            expect(rows).deep.equals([
                {
                    label: 'Segment 1',
                    value: 'ATCG',
                    initialValue: null,
                    key: firstKey,
                    fastaHeader: FASTAHEADER,
                },
                {
                    label: OTHER_LABEL,
                    value: OTHER_SEQUENCE,
                    initialValue: null,
                    key: secondKey,
                    fastaHeader: OTHER_FASTAHEADER,
                },
            ]);
        }

        expect(() => editableSequences.update('another key', 'GG', 'another key', 'anything')).toThrowError(
            'Maximum limit reached — you can add up to 2 sequence file(s) only.',
        );
        expect(editableSequences.getFastaIds()).toEqual(`${FASTAHEADER} ${OTHER_FASTAHEADER}`);
    });

    test('GIVEN MAX_SEQUENCES_PER_ENTRY is 2 THEN do not allow duplicate fasta headers', () => {
        const MAX_SEQUENCES_PER_ENTRY = 2;
        let editableSequences = EditableSequences.empty(MAX_SEQUENCES_PER_ENTRY);

        const initialRows = editableSequences.rows;
        expect(initialRows).toEqual([
            { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
        ]);
        const firstKey = initialRows[0].key;

        editableSequences = editableSequences.update(firstKey, SEQUENCE, LABEL, FASTAHEADER);
        const rowsAfterFirstUpdate = editableSequences.rows;
        const secondKey = rowsAfterFirstUpdate[1].key;

        editableSequences = editableSequences.update(
            secondKey,
            OTHER_SEQUENCE,
            OTHER_LABEL,
            FASTAHEADER_WITH_DESCRIPTION,
        );

        const errorMessage = `A sequence with the fastaID ${FASTAHEADER} already exists.`;
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining(errorMessage));

        // Expect that the second sequence was not added
        expect(editableSequences.rows).toEqual([
            { label: 'Segment 1', value: SEQUENCE, initialValue: null, key: firstKey, fastaHeader: FASTAHEADER },
            { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
        ]);
        expect(editableSequences.getFastaIds()).toEqual(FASTAHEADER);
    });

    test('GIVEN a single-segmented organism THEN only allows 1 input', async () => {
        const MAX_SEQUENCES_PER_ENTRY = 1;
        let editableSequences = EditableSequences.empty(MAX_SEQUENCES_PER_ENTRY);

        const initialRows = editableSequences.rows;
        expect(initialRows).toEqual([
            { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
        ]);
        const key = initialRows[0].key;

        editableSequences = editableSequences.update(key, SEQUENCE, key, FASTAHEADER);
        const fasta = editableSequences.getSequenceFasta();
        expect(fasta).not.toBeUndefined();
        const fastaText = await fasta!.text();
        expect.soft(fastaText).toBe(`>${FASTAHEADER}\n${SEQUENCE}`);
        expect(editableSequences.getSequenceRecord()).deep.equals({ [FASTAHEADER]: SEQUENCE });

        const rows = editableSequences.rows;
        expect(rows).deep.equals([{ label: key, value: SEQUENCE, initialValue: null, fastaHeader: FASTAHEADER, key }]);
        expect(() =>
            editableSequences.update('another key', OTHER_SEQUENCE, OTHER_LABEL, OTHER_FASTAHEADER),
        ).toThrowError('Maximum limit reached — you can add up to 1 sequence file(s) only.');
    });

    test('GIVEN MAX_SEQUENCES_PER_ENTRY is 1 THEN only allows 1 input and fasta header does not contain the segment name', async () => {
        const MAX_SEQUENCES_PER_ENTRY = 1;
        let editableSequences = EditableSequences.empty(MAX_SEQUENCES_PER_ENTRY);

        const initialRows = editableSequences.rows;
        expect(initialRows).toEqual([
            { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
        ]);
        const key = initialRows[0].key;

        editableSequences = editableSequences.update(key, SEQUENCE, LABEL, null);
        const fasta = editableSequences.getSequenceFasta();
        expect(fasta).not.toBeUndefined();
        const fastaText = await fasta!.text();
        expect.soft(fastaText).toBe(`>${key}\n${SEQUENCE}`);
        expect(editableSequences.getSequenceRecord()).deep.equals({ [key]: SEQUENCE });

        const rows = editableSequences.rows;
        expect(rows).deep.equals([{ label: LABEL, value: SEQUENCE, initialValue: null, fastaHeader: key, key }]);
        expect(() =>
            editableSequences.update('another key', OTHER_SEQUENCE, OTHER_LABEL, OTHER_FASTAHEADER),
        ).toThrowError('Maximum limit reached — you can add up to 1 sequence file(s) only.');
    });

    test('GIVEN no initial data and max 2 seq per entry WHEN I add and remove a sequence THEN input is also removed again', () => {
        const MAX_SEQUENCES_PER_ENTRY = 2;
        let editableSequences = EditableSequences.empty(MAX_SEQUENCES_PER_ENTRY);

        const key = editableSequences.rows[0].key;

        editableSequences = editableSequences.update(key, SEQUENCE, key, key);
        expect(editableSequences.rows).toEqual([
            { label: key, value: SEQUENCE, initialValue: null, key, fastaHeader: key },
            { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
        ]);

        editableSequences = editableSequences.update(key, null, null, null);
        expect(editableSequences.rows).toEqual([
            { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
        ]);
        expect(editableSequences.getFastaIds()).toEqual('');
    });

    test('GIVEN no initial data and max 1 seq per entry WHEN I add and remove a sequence THEN input is also removed again', () => {
        const MAX_SEQUENCES_PER_ENTRY = 1;

        let editableSequences = EditableSequences.empty(MAX_SEQUENCES_PER_ENTRY);

        const key = editableSequences.rows[0].key;

        editableSequences = editableSequences.update(key, SEQUENCE, key, key);
        expect(editableSequences.rows).toEqual([
            { label: key, value: SEQUENCE, initialValue: null, key, fastaHeader: key },
        ]);

        editableSequences = editableSequences.update(key, null, null, null);
        expect(editableSequences.rows).toEqual([
            { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
        ]);
    });

    test('GIVEN initial data with an empty segment THEN the fasta does not contain the empty segment', async () => {
        const MAX_SEQUENCES_PER_ENTRY = 2;
        let editableSequences = EditableSequences.fromInitialData(defaultReviewData, MAX_SEQUENCES_PER_ENTRY);
        editableSequences = editableSequences.update(editableSequences.rows[0].key, SEQUENCE, LABEL, OTHER_FASTAHEADER);
        const fasta = editableSequences.getSequenceFasta();
        expect(fasta).not.toBeUndefined();
        const fastaText = await fasta!.text();
        expect.soft(fastaText).toBe(`>${OTHER_FASTAHEADER}\n${SEQUENCE}`);

        expect(editableSequences.getSequenceRecord()).deep.equals({ [OTHER_FASTAHEADER]: SEQUENCE });
        expect(editableSequences.getFastaIds()).toEqual(OTHER_FASTAHEADER);
    });

    test('GIVEN initial segment data that is then deleted as an edit THEN the edit record does not contain the segment key but input field is kept', () => {
        const MAX_SEQUENCES_PER_ENTRY = 2;
        let editableSequences = EditableSequences.fromInitialData(defaultReviewData, MAX_SEQUENCES_PER_ENTRY);

        expect(editableSequences.rows).toEqual([
            {
                // label: 'originalFastaHeader (mapped to unalignedProcessedSequenceName)',
                label: `${originalFastaHeader} (mapped to ${unalignedProcessedSequenceName})`,
                fastaHeader: originalFastaHeader,
                value: originalUnalignedNucleotideSequenceValue,
                initialValue: originalUnalignedNucleotideSequenceValue,
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
