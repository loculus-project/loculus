import { snakeCase } from 'change-case';
import Papa from 'papaparse';
import { Fragment, type Dispatch, type FC, type SetStateAction } from 'react';

import { EditableDataRow } from './DataRow.tsx';
import type { Row } from './InputField';
import { ACCESSION_FIELD, FASTA_ID_FIELD, SUBMISSION_ID_INPUT_FIELD } from '../../settings.ts';
import { mapErrorsAndWarnings, type SequenceEntryToEdit } from '../../types/backend.ts';
import type { InputField } from '../../types/config';

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
        const row = this.rows.find((row) => row.key === SUBMISSION_ID_INPUT_FIELD);
        return row ? row.value : undefined;
    }

    /**
     * Return the Metadata information as a TSV. If no information is present, 'undefined' is returned.
     * @param submissionId optional (might already be in the rows if add to the form initially).
     *      The submission ID to put into the TSV.
     * @param accession optional. If an accession is already assigned to this sequence, it should be given.
     * @param fastaId optional. Add a fastaId field with content if supplied.
     */
    getMetadataTsv(submissionId?: string, accession?: string, fastaId?: string): File | undefined {
        // if no values are set at all, return undefined
        if (!this.rows.some((row) => row.value !== '')) return undefined;

        // If only the submission ID is set, that't not enough, also return undefined.
        if (this.rows.length === 1 && this.rows[0].key === SUBMISSION_ID_INPUT_FIELD) {
            return undefined;
        }

        const tsvFields = new Map<string, string>();

        this.rows.forEach((row) => tsvFields.set(row.key, row.value));

        if (submissionId) {
            tsvFields.set(SUBMISSION_ID_INPUT_FIELD, submissionId);
        }

        if (accession) {
            tsvFields.set(ACCESSION_FIELD, accession);
        }

        if (fastaId) {
            tsvFields.set(FASTA_ID_FIELD, fastaId);
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
                                inputField={inputField}
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

type SubmissionProps = {
    submissionId: string;
};

export const SubmissionIdRow: FC<SubmissionProps> = ({ submissionId }) => (
    <tr>
        <td className='w-1/4'>ID:</td>
        <td className='pr-3 text-right '></td>
        <td className='w-full'>{submissionId}</td>
    </tr>
);
