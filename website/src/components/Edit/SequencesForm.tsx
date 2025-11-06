import { type Dispatch, type FC, type SetStateAction } from 'react';

import { type SequenceEntryToEdit } from '../../types/backend.ts';
import type { ReferenceGenomesLightweightSchema } from '../../types/referencesGenomes.ts';
import { FileUploadComponent } from '../Submission/FileUpload/FileUploadComponent.tsx';
import { PLAIN_SEGMENT_KIND, VirtualFile } from '../Submission/FileUpload/fileProcessing.ts';

function generateAndDownloadFastaFile(
    accessionVersion: string,
    sequenceData: string,
    segmentKey?: string,
    isSingleSegment: boolean = false,
) {
    const fileName =
        isSingleSegment || !segmentKey ? `${accessionVersion}.fasta` : `${accessionVersion}_${segmentKey}.fasta`;

    const header = isSingleSegment || !segmentKey ? accessionVersion : `${accessionVersion}_${segmentKey}`;

    const fileContent = `>${header}\n${sequenceData}`;

    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();

    URL.revokeObjectURL(url);
}

type EditableSequenceFile = {
    key: string;
    label: string;
    value: string | null;
    initialValue: string | null;
};

export class EditableSequences {
    private static nextKey = 0;

    private readonly editableSequenceFiles: EditableSequenceFile[];
    private readonly maxNumberOfRows: number;

    public get rows(): Required<EditableSequenceFile>[] {
        const rows = this.editableSequenceFiles.map((row, _) => ({
            ...row,
            label: row.label,
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
                label: key,
                value: value,
                initialValue: value,
                key: EditableSequences.getNextKey(), //TODO: check if this is buggy
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
    update(key: string, value: string | null, label: string | null): EditableSequences {
        const existingFileIndex = this.editableSequenceFiles.findIndex((file) => file.key === key);

        if (existingFileIndex === -1 && this.editableSequenceFiles.length === this.maxNumberOfRows) {
            throw new Error(`Maximum limit reached — you can add up to ${this.maxNumberOfRows} sequence file(s) only.`);
        }

        label ??= value == null ? 'Add a segment' : key;

        const newSequenceFiles = [...this.editableSequenceFiles];
        newSequenceFiles[existingFileIndex > -1 ? existingFileIndex : this.editableSequenceFiles.length] = {
            ...(existingFileIndex > -1 ? newSequenceFiles[existingFileIndex] : { key, initialValue: null }),
            value: value,
            label: label,
        };

        return new EditableSequences(
            newSequenceFiles.filter((file) => file.value !== null),
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
                                const header = file ? await file.header() : null;
                                setEditableSequences((editableSequences) =>
                                    editableSequences.update(field.key, text, header),
                                );
                            }}
                            name={`${field.label}_segment_file`}
                            ariaLabel={`${field.label} Segment File`}
                            fileKind={PLAIN_SEGMENT_KIND}
                            small={true}
                            initialValue={
                                field.initialValue !== null
                                    ? new VirtualFile(field.initialValue, 'Existing data')
                                    : undefined
                            }
                            showUndo={field.initialValue !== null}
                            onDownload={
                                field.initialValue !== null && dataToEdit
                                    ? () => {
                                          const accessionVersion = `${dataToEdit.accession}.${dataToEdit.version}`;
                                          generateAndDownloadFastaFile(
                                              accessionVersion,
                                              field.value ?? '',
                                              field.label,
                                              !multiSegment,
                                          );
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
