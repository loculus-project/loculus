import { toast } from 'react-toastify';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { EditableSequences } from './SequencesForm';
import { defaultReviewData } from '../../../vitest.setup';

describe('SequencesForm', () => {
    beforeEach(() => {
        vi.spyOn(toast, 'error');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });
    test('Empty editable sequences produces no output', () => {
        const FASTAHEADER = 'FASTAHEADER';
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
            editableSequences = editableSequences.update(firstKey, 'ATCG', 'Segment 1', FASTAHEADER);
            const fasta = editableSequences.getSequenceFasta();
            expect(fasta).not.toBeUndefined();
            const fastaText = await fasta!.text();
            expect.soft(fastaText).toBe(`>${FASTAHEADER}\nATCG`);
            expect(editableSequences.getSequenceRecord()).deep.equals({ [FASTAHEADER]: 'ATCG' });

            const rows = editableSequences.rows;
            expect(rows).toEqual([
                { label: 'Segment 1', value: 'ATCG', initialValue: null, key: firstKey, fastaHeader: FASTAHEADER },
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
            editableSequences = editableSequences.update(newFirstKey, 'ATCG', 'Segment 1', FASTAHEADER);
            const fasta = editableSequences.getSequenceFasta();
            expect(fasta).not.toBeUndefined();
            const fastaText = await fasta!.text();
            expect.soft(fastaText).toBe(`>${FASTAHEADER}\nATCG`);
            expect(editableSequences.getSequenceRecord()).deep.equals({ [FASTAHEADER]: 'ATCG' });

            const rows = editableSequences.rows;
            expect(rows).toEqual([
                {
                    label: 'Segment 1',
                    value: 'ATCG',
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
            editableSequences = editableSequences.update(firstKey, 'ATCG', 'Segment 1', FASTAHEADER_WITH_DESCRIPTION);
            const fasta = editableSequences.getSequenceFasta();
            expect(fasta).not.toBeUndefined();
            const fastaText = await fasta!.text();
            expect.soft(fastaText).toBe(`>${FASTAHEADER_WITH_DESCRIPTION}\nATCG`);
            expect(editableSequences.getSequenceRecord()).deep.equals({ [FASTAHEADER_WITH_DESCRIPTION]: 'ATCG' });

            const rows = editableSequences.rows;
            expect(rows).toEqual([
                {
                    label: 'Segment 1',
                    value: 'ATCG',
                    initialValue: null,
                    fastaHeader: FASTAHEADER_WITH_DESCRIPTION,
                    key: firstKey,
                },
                { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
            ]);
            secondKey = rows[1].key;
        }

        {
            editableSequences = editableSequences.update(secondKey, 'TT', 'Segment 2', FASTAHEADER_SEGMENT2);
            const fasta = editableSequences.getSequenceFasta();
            expect(fasta).not.toBeUndefined();
            const fastaText = await fasta!.text();
            expect.soft(fastaText).toBe(`>${FASTAHEADER_WITH_DESCRIPTION}\nATCG\n>${FASTAHEADER_SEGMENT2}\nTT`);
            expect(editableSequences.getSequenceRecord()).deep.equals({
                [FASTAHEADER_WITH_DESCRIPTION]: 'ATCG',
                [FASTAHEADER_SEGMENT2]: 'TT',
            });

            const rows = editableSequences.rows;
            expect(rows).deep.equals([
                {
                    label: 'Segment 1',
                    value: 'ATCG',
                    initialValue: null,
                    key: firstKey,
                    fastaHeader: FASTAHEADER_WITH_DESCRIPTION,
                },
                {
                    label: 'Segment 2',
                    value: 'TT',
                    initialValue: null,
                    key: secondKey,
                    fastaHeader: FASTAHEADER_SEGMENT2,
                },
            ]);
        }

        expect(() => editableSequences.update('another key', 'GG', 'another key', 'anything')).toThrowError(
            'Maximum limit reached — you can add up to 2 sequence file(s) only.',
        );
        expect(editableSequences.getFastaIds()).toEqual(`${FASTAHEADER_SEGMENT1} ${FASTAHEADER_SEGMENT2}`);
    });

    test('GIVEN MAX_SEQUENCES_PER_ENTRY is 2 THEN do not allow duplicate fasta headers', () => {
        const FASTAHEADER = 'FASTAHEADER';
        const MAX_SEQUENCES_PER_ENTRY = 2;
        let editableSequences = EditableSequences.empty(MAX_SEQUENCES_PER_ENTRY);

        const initialRows = editableSequences.rows;
        expect(initialRows).toEqual([
            { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
        ]);
        const firstKey = initialRows[0].key;

        editableSequences = editableSequences.update(firstKey, 'ATCG', 'Segment 1', FASTAHEADER);
        const rowsAfterFirstUpdate = editableSequences.rows;
        const secondKey = rowsAfterFirstUpdate[1].key;

        editableSequences = editableSequences.update(secondKey, 'TT', 'Segment 2', 'FASTAHEADER description');

        const errorMessage = `A sequence with the fastaID ${FASTAHEADER} already exists.`;
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining(errorMessage));

        // Expect that the second sequence was not added
        expect(editableSequences.rows).toEqual([
            { label: 'Segment 1', value: 'ATCG', initialValue: null, key: firstKey, fastaHeader: FASTAHEADER },
            { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
        ]);
        expect(editableSequences.getFastaIds()).toEqual(FASTAHEADER);
    });

    test('GIVEN a single-segmented organism THEN only allows 1 input', async () => {
        const FASTAHEADER = 'FASTAHEADER';
        let editableSequences = EditableSequences.fromSequenceNames(makeReferenceGenomeLightweightSchema(['foo']));

        const initialRows = editableSequences.rows;
        expect(initialRows).toEqual([
            { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
        ]);
        const key = initialRows[0].key;

        editableSequences = editableSequences.update(key, 'ATCG', key, FASTAHEADER);
        const fasta = editableSequences.getSequenceFasta();
        expect(fasta).not.toBeUndefined();
        const fastaText = await fasta!.text();
        expect.soft(fastaText).toBe(`>${FASTAHEADER}\nATCG`);

        expect(editableSequences.getSequenceRecord()).deep.equals({ [FASTAHEADER]: 'ATCG' });

        const rows = editableSequences.rows;
        expect(rows).deep.equals([{ label: key, value: 'ATCG', initialValue: null, fastaHeader: FASTAHEADER, key }]);

        expect(() => editableSequences.update('another key', 'GG', 'another key', 'anything')).toThrowError(
            'Maximum limit reached — you can add up to 1 sequence file(s) only.',
        );
    });

    test('GIVEN MAX_SEQUENCES_PER_ENTRY is 1 THEN only allows 1 input and fasta header does not contain the segment name', async () => {
        const MAX_SEQUENCES_PER_ENTRY = 1;
        let editableSequences = EditableSequences.empty(MAX_SEQUENCES_PER_ENTRY);

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
        expect(rows).deep.equals([{ label: 'subId', value: 'ATCG', initialValue: null, fastaHeader: key, key }]);

        expect(() => editableSequences.update('another key', 'GG', 'another key', 'anything')).toThrowError(
            'Maximum limit reached — you can add up to 1 sequence file(s) only.',
        );
    });

    test('GIVEN no initial data and max 2 seq per entry WHEN I add and remove a sequence THEN input is also removed again', () => {
        const MAX_SEQUENCES_PER_ENTRY = 2;
        let editableSequences = EditableSequences.empty(MAX_SEQUENCES_PER_ENTRY);

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

    test('GIVEN no initial data and max 1 seq per entry WHEN I add and remove a sequence THEN input is also removed again', () => {
        const MAX_SEQUENCES_PER_ENTRY = 1;
        const FASTAHEADER = 'FASTAHEADER_label';

        let editableSequences = EditableSequences.empty(MAX_SEQUENCES_PER_ENTRY);

        const key = editableSequences.rows[0].key;

        editableSequences = editableSequences.update(key, 'ATCG', key, key);
        expect(editableSequences.rows).toEqual([
            { label: key, value: 'ATCG', initialValue: null, key, fastaHeader: key },
        ]);

        editableSequences = editableSequences.update(key, null, null, null);
        expect(editableSequences.rows).toEqual([
            { label: 'Add a segment', value: null, initialValue: null, fastaHeader: null, key: expect.any(String) },
        ]);
    });

    test('GIVEN initial data with an empty segment THEN the fasta does not contain the empty segment', async () => {
        const MAX_SEQUENCES_PER_ENTRY = 2;
        let editableSequences = EditableSequences.fromInitialData(defaultReviewData, MAX_SEQUENCES_PER_ENTRY);
        editableSequences = editableSequences.update(editableSequences.rows[0].key, 'ATCG', 'label', 'subId_label');
        const fasta = editableSequences.getSequenceFasta();
        expect(fasta).not.toBeUndefined();
        const fastaText = await fasta!.text();
        expect.soft(fastaText).toBe(`>${FASTAHEADER}\nATCG`);

        expect(editableSequences.getSequenceRecord()).deep.equals({ [FASTAHEADER]: 'ATCG' });
        expect(editableSequences.getFastaIds()).toEqual(FASTAHEADER);
    });

    test('GIVEN initial segment data that is then deleted as an edit THEN the edit record does not contain the segment key but input field is kept', () => {
        const MAX_SEQUENCES_PER_ENTRY = 2;
        let editableSequences = EditableSequences.fromInitialData(defaultReviewData, MAX_SEQUENCES_PER_ENTRY);

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
