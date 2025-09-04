import { type Dispatch, type FC, type SetStateAction } from 'react';

import { type KeyValuePair, type Row } from './InputField';
import { mapErrorsAndWarnings, type SequenceEntryToEdit } from '../../types/backend.ts';
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

export class EditableSequences {
    private constructor(public readonly rows: Row[]) {}

    private static emptyRows(names: string[]): Row[] {
        return names.map((name) => ({
            key: name,
            initialValue: '',
            value: '',
            errors: [],
            warnings: [],
        }));
    }

    private isMultsegmented() {
        return this.rows.length > 1;
    }

    /**
     * @param initialData The sequence entry to edit, from which the initial sequence data is taken.
     * @param segmentNames All segment names for the organism of the sequence. This is used to include empty segments.
     */
    static fromInitialData(initialData: SequenceEntryToEdit, segmentNames: string[]): EditableSequences {
        const emptyRows = this.emptyRows(segmentNames);
        const existingDataRows = Object.entries(initialData.originalData.unalignedNucleotideSequences).map(
            ([key, value]) => ({
                key,
                initialValue: value,
                value: value,
                ...mapErrorsAndWarnings(initialData, key, 'NucleotideSequence'),
            }),
        );
        const mergedRows: Row[] = [];
        // merge in this way to retain the order of segment names as they were given.
        emptyRows.forEach((row) => {
            const existingRow = existingDataRows.find((r) => r.key === row.key);
            if (existingRow) {
                mergedRows.push(existingRow);
            } else {
                mergedRows.push(row);
            }
        });
        return new EditableSequences(mergedRows);
    }

    /**
     * Create an empty {@link EditableSequences} object from segment names.
     * Each segment will be empty initially.
     */
    static fromSequenceNames(segmentNames: string[]): EditableSequences {
        return new EditableSequences(this.emptyRows(segmentNames));
    }

    /**
     * Create a new {@link EditableSequences} object with the given row value updated.
     */
    update(editedRow: KeyValuePair & {}): EditableSequences {
        return new EditableSequences(
            this.rows.map((prevRow) =>
                prevRow.key === editedRow.key ? { ...prevRow, value: editedRow.value.trim() } : prevRow,
            ),
        );
    }

    getSequenceFasta(submissionId: string): File | undefined {
        const filledRows = this.rows.filter((row) => row.value.trim() !== '');

        // if no values are set at all, return undefined
        if (filledRows.length === 0) return undefined;

        const fastaContent = !this.isMultsegmented()
            ? `>${submissionId}\n${filledRows[0].value}`
            : filledRows
                  .map((sequence) => `>${submissionId}_${sequence.key}\n${sequence.value}`)
                  .filter(Boolean)
                  .join('\n');

        return new File([fastaContent], 'sequences.fasta', { type: 'text/plain' });
    }

    getSequenceRecord(): Record<string, string> {
        return this.rows
            .filter((row) => row.value.trim() !== '')
            .reduce((prev, row) => ({ ...prev, [row.key]: row.value }), {});
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
    const singleSegment = editableSequences.rows.length === 1;
    return (
        <>
            <h3 className='subtitle'>{`Nucleotide sequence${singleSegment ? '' : 's'}`}</h3>
            <div className='flex flex-col lg:flex-row gap-6'>
                {editableSequences.rows.map((field) => (
                    <div className='space-y-2 w-56' key={field.key}>
                        {!singleSegment && (
                            <label className='text-gray-900 font-medium text-sm block'>{field.key} segment</label>
                        )}
                        <FileUploadComponent
                            setFile={async (file) => {
                                const text = file ? await file.text() : '';
                                setEditableSequences((editableSequences) =>
                                    editableSequences.update({
                                        key: field.key,
                                        value: text,
                                    }),
                                );
                            }}
                            name={`${field.key}_segment_file`}
                            ariaLabel={`${field.key} Segment File`}
                            fileKind={PLAIN_SEGMENT_KIND}
                            small={true}
                            initialValue={
                                field.initialValue.length > 0
                                    ? new VirtualFile(field.initialValue, 'Existing data')
                                    : undefined
                            }
                            showUndo={true}
                            onDownload={
                                field.initialValue.length > 0 && dataToEdit
                                    ? () => {
                                          const accessionVersion = `${dataToEdit.accession}.${dataToEdit.version}`;
                                          generateAndDownloadFastaFile(
                                              accessionVersion,
                                              field.initialValue,
                                              field.key,
                                              singleSegment,
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
