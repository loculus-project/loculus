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
    label: string;
    fastaHeader: string;
    value: string;
    initialLabel: string | null;
    initialFastaHeader: string | null;
    initialValue: string | null;
};

type PlaceholderSequenceFile = {
    key: string;
    label: string;
    fastaHeader: null;
    value: null;
    initialLabel: null;
    initialFastaHeader: null;
    initialValue: null;
};

export class EditableSequences {
    private readonly editableSequenceFiles: EditableSequenceFile[];
    private readonly placeholderFile: PlaceholderSequenceFile;
    private readonly maxNumberOfRows: number;

    public get rows(): Required<EditableSequenceFile | PlaceholderSequenceFile>[] {
        const sequenceFiles: (EditableSequenceFile | PlaceholderSequenceFile)[] = [...this.editableSequenceFiles];

        if (this.editableSequenceFiles.length < this.maxNumberOfRows) {
            sequenceFiles.push(this.placeholderFile);
        }

        return sequenceFiles;
    }

    private constructor(rows: EditableSequenceFile[], maxNumberOfRows: number) {
        this.editableSequenceFiles = rows;
        this.placeholderFile = {
            key: crypto.randomUUID(),
            label: `Add a segment`,
            fastaHeader: null,
            value: null,
            initialLabel: null,
            initialFastaHeader: null,
            initialValue: null,
        };
        this.maxNumberOfRows = maxNumberOfRows;
    }

    isMultiSegmented() {
        return this.maxNumberOfRows > 1;
    }

    private static invertRecordMulti(obj: Record<string, string | null>): Record<string, string[]> {
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
        const existingDataRows = Object.entries(initialData.submittedData.unalignedNucleotideSequences).map(
            ([header, value]) => {
                const mapped = (fastaHeaderMap[header] ?? []).join(', ') || '';
                const label = !mapped
                    ? `${header} (could not be classified)`
                    : mapped === header
                      ? header
                      : `${header} (mapped to ${mapped})`;
                return {
                    key: crypto.randomUUID(),
                    label,
                    fastaHeader: maxNumberRows > 1 ? header : initialData.submissionId,
                    value,
                    initialLabel: label,
                    initialFastaHeader: maxNumberRows > 1 ? header : initialData.submissionId,
                    initialValue: value,
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

    /**
     * Create a new {@link EditableSequences} object with the given row value updated.
     */
    update(key: string, value: string, fastaHeader: string): EditableSequences {
        const existingFileIndex = this.editableSequenceFiles.findIndex((file) => file.key === key);

        if (existingFileIndex === -1 && this.editableSequenceFiles.length === this.maxNumberOfRows) {
            throw new Error(`Maximum limit reached — you can add up to ${this.maxNumberOfRows} sequence file(s) only.`);
        }

        if (
            this.editableSequenceFiles
                .filter((seq) => seq.key !== key)
                .some((seq) => getFastaId(seq.fastaHeader) === getFastaId(fastaHeader))
        ) {
            throw new Error(`A sequence with the fastaID ${getFastaId(fastaHeader)} already exists.`);
        }

        const newSequenceFiles = [...this.editableSequenceFiles];
        if (existingFileIndex === -1) {
            if (key !== this.placeholderFile.key) {
                throw new Error('Invalid key — cannot update sequence file.');
            }
            newSequenceFiles.push({
                key,
                label: fastaHeader,
                fastaHeader,
                value,
                initialLabel: null,
                initialFastaHeader: null,
                initialValue: null,
            });
        } else {
            const row = newSequenceFiles[existingFileIndex];
            const isInitialData = value === row.initialValue && fastaHeader === row.initialFastaHeader;
            newSequenceFiles[existingFileIndex] = {
                ...row,
                value,
                label: isInitialData && row.initialLabel !== null ? row.initialLabel : fastaHeader,
                fastaHeader,
            };
        }

        return new EditableSequences(newSequenceFiles, this.maxNumberOfRows);
    }

    /**
     * Create a new {@link EditableSequences} object with the given row removed.
     */
    remove(key: string): EditableSequences {
        const newSequenceFiles = this.editableSequenceFiles.filter((file) => file.key !== key);
        return new EditableSequences(newSequenceFiles, this.maxNumberOfRows);
    }

    getFastaIds(): string {
        return this.rows
            .flatMap((row) => {
                const id = getFastaId(row.fastaHeader);
                return id === null || id === '' ? [] : [id];
            })
            .join(FASTA_IDS_SEPARATOR);
    }

    hasNoSequences(): boolean {
        return this.editableSequenceFiles.length === 0;
    }

    getSequenceFasta(): File | undefined {
        if (this.hasNoSequences()) return undefined;

        const fastaContent = this.editableSequenceFiles
            .map((sequence) => `>${sequence.fastaHeader}\n${sequence.value}`)
            .join('\n');

        return new File([fastaContent], 'sequences.fasta', { type: 'text/plain' });
    }

    getSequenceRecord(): Record<string, string> {
        return this.editableSequenceFiles.reduce<Record<string, string>>((prev, row) => {
            prev[row.fastaHeader] = row.value;
            return prev;
        }, {});
    }
}
