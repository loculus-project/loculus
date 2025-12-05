import { type Dispatch, type FC, type SetStateAction } from 'react';
import { toast } from 'react-toastify';

import { type SequenceEntryToEdit } from '../../types/backend.ts';
import { FASTA_IDS_SEPARATOR } from '../../types/config.ts';
import type { ReferenceGenomesLightweightSchema } from '../../types/referencesGenomes.ts';
import { FileUploadComponent } from '../Submission/FileUpload/FileUploadComponent.tsx';
import { PLAIN_SEGMENT_KIND, VirtualPlainSegmentFile } from '../Submission/FileUpload/fileProcessing.ts';

function generateAndDownloadFastaFile(fastaHeader: string, sequenceData: string) {
    const trimmedHeader = fastaHeader.replace(/\s+/g, '');
    const fileContent = `>${trimmedHeader}\n${sequenceData}`;

    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${trimmedHeader}.fasta`;
    a.click();

    URL.revokeObjectURL(url);
}

function getFastaId(fastaHeader: string | null): string | null {
  if (!fastaHeader) return null;
  return fastaHeader.split(/\s+/)[0] || null;
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
        const rows = this.editableSequenceFiles.map((row, i) => ({
            ...row,
            label: row.label ?? `Segment ${i + 1}`,
        }));
        if (rows.length < this.maxNumberOfRows) {
            rows.push({
                label: `Add a segment`,
                fastaHeader: null,
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
     * @param referenceGenomeLightweightSchema
     */
    static fromInitialData(
        initialData: SequenceEntryToEdit,
        referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema,
    ): EditableSequences {
        const maxNumberRows = this.getMaxNumberOfRows(referenceGenomeLightweightSchema);
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
    update(key: string, value: string | null, label: string | null, fastaHeader: string | null): EditableSequences {
        const existingFileIndex = this.editableSequenceFiles.findIndex((file) => file.key === key);

        if (existingFileIndex === -1 && this.editableSequenceFiles.length === this.maxNumberOfRows) {
            throw new Error(`Maximum limit reached — you can add up to ${this.maxNumberOfRows} sequence file(s) only.`);
        }

        fastaHeader ??= value == null ? null : key; // Ensure fastaHeader is never null if a sequence exists
        if (this.editableSequenceFiles.some((seq) => getFastaId(seq.fastaHeader) === getFastaId(fastaHeader))) {
            toast.error(`A sequence with the fastaID ${getFastaId(fastaHeader)} already exists.`);
            return new EditableSequences(
                this.editableSequenceFiles.filter((file) => file.value !== null),
                this.maxNumberOfRows,
            );
        }

        const newSequenceFiles = [...this.editableSequenceFiles];
        newSequenceFiles[existingFileIndex > -1 ? existingFileIndex : this.editableSequenceFiles.length] = {
            ...(existingFileIndex > -1 ? newSequenceFiles[existingFileIndex] : { key, initialValue: null }),
            value: value,
            label: label,
            fastaHeader: fastaHeader,
        };

        return new EditableSequences(
            newSequenceFiles.filter((file) => file.value !== null),
            this.maxNumberOfRows,
        );
    }

    getFastaIds(): string {
        return this.rows
            .flatMap((row) => {
                if (row.value === null) return [];
                const id = getFastaId(row.fastaHeader);
                return id ? [id] : [];
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

type SequenceFormProps = {
    editableSequences: EditableSequences;
    setEditableSequences: Dispatch<SetStateAction<EditableSequences>>;
    dataToEdit?: SequenceEntryToEdit;
    isLoading?: boolean;
};
export const SequencesForm: FC<SequenceFormProps> = ({
    editableSequences,
    setEditableSequences,
    dataToEdit,
    isLoading,
}) => {
    const multiSegment = editableSequences.isMultiSegmented();
    return (
        <>
            <h3 className='subtitle'>{`Nucleotide sequence${multiSegment ? 's' : ''}`}</h3>
            <div className='flex flex-col lg:flex-row gap-6'>
                {editableSequences.rows.map((field) => (
                    <div className='space-y-2 w-56' key={field.key}>
                        {multiSegment && (
                            <label className='text-gray-900 font-medium text-sm block'>{field.label}</label>
                        )}
                        <FileUploadComponent
                            setFile={async (file) => {
                                const text = file ? await file.text() : null;
                                const fastaHeader = file?.fastaHeader() ?? null;
                                setEditableSequences((editableSequences) =>
                                    editableSequences.update(field.key, text, fastaHeader, fastaHeader),
                                );
                            }}
                            name={`${field.label}_segment_file`}
                            ariaLabel={`${field.label} Segment File`}
                            fileKind={PLAIN_SEGMENT_KIND}
                            small={true}
                            initialValue={
                                field.initialValue !== null
                                    ? new VirtualPlainSegmentFile(field.initialValue, 'Existing data')
                                    : undefined
                            }
                            showUndo={field.initialValue !== null}
                            onDownload={
                                field.initialValue !== null && field.value !== null && dataToEdit
                                    ? () => {
                                          if (field.value === null) return;
                                          generateAndDownloadFastaFile(field.fastaHeader ?? 'sequence', field.value);
                                      }
                                    : undefined
                            }
                            downloadDisabled={isLoading}
                        />
                    </div>
                ))}
            </div>
        </>
    );
};
