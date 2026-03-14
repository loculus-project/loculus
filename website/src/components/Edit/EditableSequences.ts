import { toast } from 'react-toastify';

import type { SequenceEntryToEdit } from '../../types/backend.ts';
import { FASTA_IDS_SEPARATOR } from '../../types/config.ts';

function getFastaId(fastaHeader: string | null): string | null {
    if (fastaHeader === null || fastaHeader === '') {
        return null;
    }
    return fastaHeader.split(/\s+/)[0] ?? null;
}

type EditableSequenceFile = {
    key: string;
    label: string | null;
    fastaHeader: string | null;
    value: string | null;
    initialValue: string | null;
};
export class EditableSequences {
    private static nextKey = 0;

    private readonly editableSequenceFiles: EditableSequenceFile[];
    private readonly maxNumberOfRows: number;

    public get rows(): Required<EditableSequenceFile>[] {
        return this.editableSequenceFiles;
    }

    private constructor(rows: EditableSequenceFile[], maxNumberOfRows: number) {
        this.maxNumberOfRows = maxNumberOfRows;
        this.editableSequenceFiles = EditableSequences.normalizeRows(rows, maxNumberOfRows);
    }

    isMultiSegmented() {
        return this.maxNumberOfRows > 1;
    }

    /**
     * Internal helper:
     *  - Remove any rows with value === null
     *  - Set label if missing
     *  - If there is capacity, append exactly one fresh placeholder row.
     */
    private static normalizeRows(rows: EditableSequenceFile[], maxNumberOfRows: number): EditableSequenceFile[] {
        const rowsWithoutPlaceholders = rows
            .filter((row) => row.value !== null)
            .map((row, i) => ({
                ...row,
                label: row.label ?? `Segment ${i + 1}`,
            }));

        if (rowsWithoutPlaceholders.length >= maxNumberOfRows) {
            return rowsWithoutPlaceholders;
        }

        return [
            ...rowsWithoutPlaceholders,
            {
                key: EditableSequences.getNextKey(),
                label: 'Add a segment',
                fastaHeader: null,
                value: null,
                initialValue: null,
            },
        ];
    }

    static invertRecordMulti(obj: Record<string, string | null>): Record<string, string[]> {
        const inverted: Record<string, string[]> = {};

        for (const key in obj) {
            const value = obj[key];
            if (value === null) continue;
            (inverted[value] ??= []).push(key);
        }

        return inverted;
    }

    /**
     * @param initialData The sequence entry to edit, from which the initial sequence data is taken.
     * @param maxSequencesPerEntry The maximum number of sequences allowed per entry.
     */
    static fromInitialData(initialData: SequenceEntryToEdit, maxSequencesPerEntry?: number): EditableSequences {
        const maxNumberRows = maxSequencesPerEntry ?? Infinity;
        const fastaHeaderMap = EditableSequences.invertRecordMulti(initialData.processedData.sequenceNameToFastaId);
        const existingDataRows = Object.entries(initialData.originalData.unalignedNucleotideSequences).map(
            ([key, value]) => {
                const mapped = (fastaHeaderMap[key] ?? []).join(', ') || '';
                const label = !mapped
                    ? `${key} (could not be classified)`
                    : mapped === key
                      ? key
                      : `${key} (mapped to ${mapped})`;
                return {
                    label,
                    fastaHeader: maxNumberRows > 1 ? key : initialData.submissionId,
                    value: value,
                    initialValue: value,
                    key: EditableSequences.getNextKey(),
                };
            },
        );

        return new EditableSequences(existingDataRows, maxNumberRows);
    }

    /**
     * Create an empty {@link EditableSequences} object.
     */
    static empty(maxSequencesPerEntry?: number): EditableSequences {
        return new EditableSequences([], maxSequencesPerEntry ?? Infinity);
    }

    private static getNextKey(): string {
        return (EditableSequences.nextKey++).toString();
    }

    /**
     * Create a new {@link EditableSequences} object with the given row value updated.
     */
    update(key: string, value: string | null, label: string | null, fastaHeader: string | null): EditableSequences {
        const rows = this.editableSequenceFiles;
        const rowsWithoutPlaceholders = rows.filter((row) => row.value !== null);
        const existingFileIndex = rows.findIndex((file) => file.key === key);
        if (existingFileIndex === -1) {
            throw new Error(`Attempting to update sequence with key '${key}' that does not exist.`);
        }
        fastaHeader ??= value == null ? null : key; // Ensure fastaHeader is never null if a sequence exists
        if (
            rowsWithoutPlaceholders.some(
                (seq, index) => index !== existingFileIndex && getFastaId(seq.fastaHeader) === getFastaId(fastaHeader),
            )
        ) {
            toast.error(`A sequence with the fastaID ${getFastaId(fastaHeader)} already exists.`);
            return this;
        }

        const newRows = [...rows];

        newRows[existingFileIndex] = {
            ...newRows[existingFileIndex],
            value,
            label,
            fastaHeader,
        };

        return new EditableSequences(newRows, this.maxNumberOfRows);
    }

    getFastaIds(): string {
        return this.rows
            .flatMap((row) => {
                if (row.value === null) return [];
                const id = getFastaId(row.fastaHeader);
                return id === null || id === '' ? [] : [id];
            })
            .join(FASTA_IDS_SEPARATOR);
    }

    getSequenceFasta(): File | undefined {
        const filledRows = this.rows.filter((row) => row.value !== null);

        if (filledRows.length === 0) {
            return undefined;
        }

        const fastaContent = filledRows.map((sequence) => `>${sequence.fastaHeader}\n${sequence.value}`).join('\n');

        return new File([fastaContent], 'sequences.fasta', { type: 'text/plain' });
    }

    getSequenceRecord(): Record<string, string> {
        const filledRows = this.rows.filter(
            (
                row,
            ): row is Omit<EditableSequenceFile, 'fastaHeader' | 'value' | 'label'> & {
                fastaHeader: string;
                value: string;
                label: string;
            } => row.value !== null && row.fastaHeader !== null && row.label !== null,
        );

        return filledRows.reduce<Record<string, string>>((prev, row) => {
            prev[row.fastaHeader] = row.value;
            return prev;
        }, {});
    }
}
