import { type Dispatch, type FC, type SetStateAction } from 'react';

import type { KeyValuePair, Row } from './InputField';
import { mapErrorsAndWarnings, type SequenceEntryToEdit } from '../../types/backend.ts';
import { FileUploadComponent } from '../Submission/FileUpload/FileUploadComponent.tsx';
import { PLAIN_SEGMENT_KIND } from '../Submission/FileUpload/fileProcessing.ts';

export class EditableSequences {
    private constructor(public readonly rows: Row[]) {}

    static fromInitialData(initialData: SequenceEntryToEdit): EditableSequences {
        return new EditableSequences(
            Object.entries(initialData.originalData.unalignedNucleotideSequences).map(([key, value]) => ({
                key,
                initialValue: value.toString(),
                value: value.toString(),
                ...mapErrorsAndWarnings(initialData, key, 'NucleotideSequence'),
            })),
        );
    }

    static fromSequenceNames(segmentNames: string[]): EditableSequences {
        return new EditableSequences(
            segmentNames.map((name) => ({
                key: name,
                initialValue: '',
                value: '',
                errors: [],
                warnings: [],
            })),
        );
    }

    static empty(): EditableSequences {
        return new EditableSequences([]);
    }

    update(editedRow: KeyValuePair & {}): EditableSequences {
        return new EditableSequences(
            this.rows.map((prevRow) =>
                prevRow.key === editedRow.key ? { ...prevRow, value: editedRow.value } : prevRow,
            ),
        );
    }

    getSequenceFasta(submissionId: string): File | undefined {
        // if no values are set at all, return undefined
        if (!this.rows.some((row) => row.value !== '')) return undefined;

        const sequences = this.rows;
        const fastaContent =
            sequences.length === 1
                ? `>${submissionId}\n${sequences[0].value}`
                : sequences
                      .map((sequence) => {
                          if (sequence.value.trim().length > 0) {
                              return `>${submissionId}_${sequence.key}\n${sequence.value}`;
                          } else {
                              return null;
                          }
                      })
                      .filter(Boolean)
                      .join('\n');

        return new File([fastaContent], 'sequences.fasta', { type: 'text/plain' });
    }

    getSequenceRecord(): Record<string, string> {
        return this.rows.reduce((prev, row) => ({ ...prev, [row.key]: row.value }), {});
    }
}

type SequenceFormProps = {
    editableSequences: EditableSequences;
    setEditableSequences: Dispatch<SetStateAction<EditableSequences>>;
};
export const SequencesForm: FC<SequenceFormProps> = ({ editableSequences, setEditableSequences }) => {
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
                        />
                    </div>
                ))}
            </div>
        </>
    );
};
