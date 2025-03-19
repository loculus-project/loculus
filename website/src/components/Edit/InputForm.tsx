import { sentenceCase, snakeCase } from 'change-case';
import Papa from 'papaparse';
import { Fragment, type Dispatch, type FC, type SetStateAction } from 'react';

import { EditableDataRow } from './DataRow.tsx';
import type { KeyValuePair, Row } from './InputField';
import { ACCESSION_FIELD, SUBMISSION_ID_FIELD } from '../../settings.ts';
import type { ProcessingAnnotationSourceType, SequenceEntryToEdit } from '../../types/backend.ts';
import type { InputField } from '../../types/config';
import { FileUploadComponent } from '../Submission/FileUpload/FileUploadComponent.tsx';
import { PLAIN_SEGMENT_KIND, VirtualFile } from '../Submission/FileUpload/fileProcessing.ts';

type SubtitleProps = {
    title: string;
    bold?: boolean;
    small?: boolean;
    customKey?: string;
};
export const Subtitle: FC<SubtitleProps> = ({ title, bold, small, customKey }) => (
    <Fragment key={snakeCase(customKey ?? title) + '_fragment'}>
        <tr key={snakeCase(customKey ?? title) + '_spacing'} className='h-4' />
        <tr key={snakeCase(customKey ?? title)} className='subtitle'>
            <td className={`${(bold ?? false) ? 'font-semibold' : 'font-normal'} ${small && 'text-base'}`} colSpan={3}>
                {title}
            </td>
        </tr>
    </Fragment>
);

/**
 * Immutable class used by the {@link MetadataForm}. 'Mutate' objects with the {@link updateWith} method.
 * Also encapsulates functionality to turn the metadata either into a TSV file or into a Record for API
 * submission.
 */
export class EditableMetadata {
    private constructor(public readonly rows: Row[]) {}

    static fromInitialData(initialData: SequenceEntryToEdit): EditableMetadata {
        return new EditableMetadata(
            Object.entries(initialData.originalData.metadata).map(([key, value]) => ({
                key,
                value,
                initialValue: value,
                ...mapErrorsAndWarnings(initialData, key, 'Metadata'),
            })),
        );
    }

    static empty(): EditableMetadata {
        return new EditableMetadata([]);
    }

    updateWith(editedRow: Row): EditableMetadata {
        const relevantOldRow = this.rows.find((oldRow) => oldRow.key === editedRow.key);
        const updatedRows = relevantOldRow
            ? this.rows.map((prevRow) =>
                  prevRow.key === editedRow.key ? { ...prevRow, value: editedRow.value } : prevRow,
              )
            : [...this.rows, editedRow];
        return new EditableMetadata(JSON.parse(JSON.stringify(updatedRows)));
    }

    /**
     * Helper function to get the Submission ID from the rows, if it is present.
     */
    getSubmissionId(): string | undefined {
        const row = this.rows.find((row) => row.key === SUBMISSION_ID_FIELD);
        return row ? row.value : undefined;
    }

    /**
     * Return the Metadata information as a TSV. If no information is present, 'undefined' is returned.
     * @param submissionId optional (might already be in the rows if add to the form initially).
     *      The submission ID to put into the TSV.
     * @param accession optional. If an accession is already assigned to this sequence, it should be given.
     */
    getMetadataTsv(submissionId?: string, accession?: string): File | undefined {
        // if no values are set at all, return undefined
        if (!this.rows.some((row) => row.value !== '')) return undefined;

        // If only the submission ID is set, that't not enough, also return undefined.
        if (this.rows.length === 1 && this.rows[0].key === SUBMISSION_ID_FIELD) {
            return undefined;
        }

        const tsvFields = new Map<string, string>();

        this.rows.forEach((row) => tsvFields.set(row.key, row.value));

        if (submissionId) {
            tsvFields.set(SUBMISSION_ID_FIELD, submissionId);
        }

        if (accession) {
            tsvFields.set(ACCESSION_FIELD, accession);
        }

        const tsvContent = Papa.unparse([Array.from(tsvFields.keys()), Array.from(tsvFields.values())], {
            delimiter: '\t',
            newline: '\n',
        });

        return new File([tsvContent], 'metadata.tsv', { type: 'text/tab-separated-values' });
    }

    getMetadataRecord(): Record<string, string> {
        return this.rows.reduce((prev, row) => ({ ...prev, [row.key]: row.value }), {});
    }
}

type MetadataFormProps = {
    editableMetadata: EditableMetadata;
    setEditableMetadata: Dispatch<SetStateAction<EditableMetadata>>;
    groupedInputFields: Map<string, InputField[]>;
    /**
     * If it is a submit form, input fields for noEdit fields will be generated.
     * If not, these fields will be skipped.
     */
    isSubmitForm?: boolean;
};
export const MetadataForm: FC<MetadataFormProps> = ({
    editableMetadata,
    setEditableMetadata,
    groupedInputFields,
    isSubmitForm: submitMode = false,
}) => (
    <>
        <Subtitle title='Metadata' />
        {Array.from(groupedInputFields.entries()).map(([group, fields]) => {
            if (fields.length === 0) return undefined;
            return (
                <Fragment key={group}>
                    <Subtitle title={group} small />
                    {fields.map((inputField) => {
                        const field = editableMetadata.rows.find(
                            (editedMetadataField) => editedMetadataField.key === inputField.name,
                        ) ?? {
                            key: inputField.name,
                            value: '',
                            initialValue: '',
                            warnings: [],
                            errors: [],
                        };

                        // if we're in edit mode and the field is marked as 'noEdit': skip.
                        if (!submitMode && inputField.noEdit) {
                            return null;
                        }

                        return (
                            <EditableDataRow
                                label={inputField.displayName ?? sentenceCase(inputField.name)}
                                inputField={inputField.name}
                                key={'raw_metadata' + inputField.name}
                                row={field}
                                onChange={(editedRow: Row) =>
                                    setEditableMetadata((prevMetadata) => prevMetadata.updateWith(editedRow))
                                }
                            />
                        );
                    })}
                </Fragment>
            );
        })}
    </>
);

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

    static fromInitialData(initialData: SequenceEntryToEdit, segmentNames: string[]): EditableSequences {
        const emptyRows = this.emptyRows(segmentNames);
        const existingDataRows = Object.entries(initialData.originalData.unalignedNucleotideSequences).map(
            ([key, value]) => ({
                key,
                initialValue: value.toString(),
                value: value.toString(),
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

    static fromSequenceNames(segmentNames: string[]): EditableSequences {
        return new EditableSequences(this.emptyRows(segmentNames));
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
                            initialValue={
                                field.initialValue.length > 0
                                    ? new VirtualFile(field.initialValue, 'existing_data.txt')
                                    : undefined
                            }
                        />
                    </div>
                ))}
            </div>
        </>
    );
};

type SubmissionProps = {
    submissionId: string;
};

export const SubmissionIdRow: FC<SubmissionProps> = ({ submissionId }) => (
    <tr>
        <td className='w-1/4'>Submission ID:</td>
        <td className='pr-3 text-right '></td>
        <td className='w-full'>{submissionId}</td>
    </tr>
);

const mapErrorsAndWarnings = (
    editedData: SequenceEntryToEdit,
    key: string,
    type: ProcessingAnnotationSourceType,
): { errors: string[]; warnings: string[] } => ({
    errors: (editedData.errors ?? [])
        .filter(
            (error) => error.processedFields.find((field) => field.name === key && field.type === type) !== undefined,
        )
        .map((error) => error.message),
    warnings: (editedData.warnings ?? [])
        .filter(
            (warning) =>
                warning.processedFields.find((field) => field.name === key && field.type === type) !== undefined,
        )
        .map((warning) => warning.message),
});
