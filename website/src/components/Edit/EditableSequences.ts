import type { SequenceEntryToEdit } from '../../types/backend.ts';
import type { ReferenceGenomesLightweightSchema } from '../../types/referencesGenomes.ts';

type EditableSequenceFile = {
    key: string;
    label?: string;
    value: string | null;
    initialValue: string | null;
};

export class EditableSequences {
    private static nextKey = 0;

    private readonly editableSequenceFiles: EditableSequenceFile[];
    private readonly maxNumberOfRows: number;

    public get rows(): Required<EditableSequenceFile>[] {
        const rows = this.editableSequenceFiles.map((row, i) => ({
            ...row,
            label: row.label ?? `Segment ${i + 1}`,
        }));
        if (rows.length < this.maxNumberOfRows) {
            rows.push({
                label: `Add a segment`,
                value: null,
                initialValue: null,
                key: EditableSequences.getNextKey(),
            });
        }
        return rows;
    }

    private constructor(rows: EditableSequenceFile[], maxNumberOfRows: number) {
        this.editableSequenceFiles = rows;
        this.maxNumberOfRows = maxNumberOfRows;
    }

    isMultiSegmented() {
        return this.maxNumberOfRows > 1;
    }

    /**
     * @param initialData The sequence entry to edit, from which the initial sequence data is taken.
     * @param referenceGenomeLightweightSchema
     */
    static fromInitialData(
        initialData: SequenceEntryToEdit,
        referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema,
    ): EditableSequences {
        const existingDataRows = Object.entries(initialData.originalData.unalignedNucleotideSequences).map(
            ([key, value]) => ({
                label: `${key} segment`,
                value: value,
                initialValue: value,
                key: EditableSequences.getNextKey(),
            }),
        );
        return new EditableSequences(existingDataRows, this.getMaxNumberOfRows(referenceGenomeLightweightSchema));
    }

    /**
     * Create an empty {@link EditableSequences} object from segment names.
     * Each segment will be empty initially.
     */
    static fromSequenceNames(referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema): EditableSequences {
        return new EditableSequences([], this.getMaxNumberOfRows(referenceGenomeLightweightSchema));
    }

    private static getMaxNumberOfRows(referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema): number {
        return Math.max(
            ...Object.values(referenceGenomeLightweightSchema).map(
                (suborganismSchema) => suborganismSchema.nucleotideSegmentNames.length,
            ),
        );
    }

    private static getNextKey(): string {
        return (EditableSequences.nextKey++).toString();
    }

    /**
     * Create a new {@link EditableSequences} object with the given row value updated.
     */
    update(key: string, value: string | null): EditableSequences {
        const existingFileIndex = this.editableSequenceFiles.findIndex((file) => file.key === key);

        if (existingFileIndex === -1 && this.editableSequenceFiles.length === this.maxNumberOfRows) {
            throw new Error(`Must not add more than ${this.maxNumberOfRows} sequence file(s).`);
        }

        const newSequenceFiles = [...this.editableSequenceFiles];
        newSequenceFiles[existingFileIndex > -1 ? existingFileIndex : this.editableSequenceFiles.length] = {
            ...(existingFileIndex > -1 ? newSequenceFiles[existingFileIndex] : { key, initialValue: null }),
            value: value,
        };

        return new EditableSequences(
            newSequenceFiles.filter((file) => file.value !== null || file.label !== undefined),
            this.maxNumberOfRows,
        );
    }

    getSequenceFasta(submissionId: string): File | undefined {
        const filledRows = this.rows.filter((row) => row.value !== null);

        if (filledRows.length === 0) {
            return undefined;
        }

        const fastaContent = !this.isMultiSegmented()
            ? `>${submissionId}\n${filledRows[0].value}`
            : filledRows
                  .map(
                      (sequence) =>
                          `>${submissionId}_${sequence.label.replaceAll(/[^a-zA-Z0-9]/g, '')}\n${sequence.value}`,
                  )
                  .join('\n');

        return new File([fastaContent], 'sequences.fasta', { type: 'text/plain' });
    }

    getSequenceRecord(): Record<string, string> {
        return this.rows
            .filter((row) => row.value !== null)
            .reduce((prev, row) => ({ ...prev, [row.label]: row.value }), {});
    }
}
