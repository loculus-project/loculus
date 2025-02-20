import { sentenceCase, snakeCase } from 'change-case';
import { Fragment, type Dispatch, type FC, type SetStateAction } from 'react';

import { EditableDataRow } from './DataRow.tsx';
import type { Row } from './InputField';
import { ACCESSION_FIELD, SUBMISSION_ID_FIELD } from '../../settings.ts';
import type { ProcessingAnnotationSourceType, SequenceEntryToEdit } from '../../types/backend.ts';
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

export class EditableMetadata {
    private constructor(public readonly rows: Row[]) {}

    static fromInitialData(initialData: SequenceEntryToEdit): EditableMetadata {
        return new EditableMetadata(mapMetadataToRow(initialData));
    }

    static empty(): EditableMetadata {
        return new EditableMetadata([]);
    }

    updateWith(editedRow: Row): EditableMetadata {
        const relevantOldRow = this.rows.find((oldRow) => oldRow.key === editedRow.key);
        return new EditableMetadata(
            relevantOldRow
                ? this.rows.map((prevRow) =>
                      prevRow.key === editedRow.key ? { ...prevRow, value: editedRow.value } : prevRow,
                  )
                : [...this.rows, editedRow],
        );
    }

    /**
     * Return the Metadata information as a TSV. If no information is present, 'undefined' is returned.
     * @param submissionId The submission ID to put into the TSV.
     * @param accession optional. If an accession is already assigned to this sequence, it should be given.
     */
    getMetadataTsv(submissionId: string, accession?: string): File | undefined {
        // if no values are set at all, return undefined
        if (!this.rows.some((row) => row.value !== '')) return undefined;

        const tableVals = [...this.rows, { key: SUBMISSION_ID_FIELD, value: submissionId }];

        if (accession) {
            tableVals.push({
                key: ACCESSION_FIELD,
                value: accession,
            });
        }

        // TODO - use a library for TSV building, because raw string interpolation doesn't escape stuff.

        const header = tableVals.map((row) => row.key).join('\t');

        const values = tableVals.map((row) => row.value).join('\t');

        const tsvContent = `${header}\n${values}`;

        return new File([tsvContent], 'metadata.tsv', { type: 'text/tab-separated-values' });
    }

    getMetadataRecord(): Record<string, string> {
        return this.rows.reduce((prev, row) => ({ ...prev, [row.key]: row.value }), {});
    }
}

type MetadataForm = {
    editableMetadata: EditableMetadata;
    setEditableMetadata: Dispatch<SetStateAction<EditableMetadata>>;
    groupedInputFields: Map<string, InputField[]>;
};
export const MetadataForm: FC<MetadataForm> = ({ editableMetadata, setEditableMetadata, groupedInputFields }) => (
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

                        return !inputField.noEdit ? (
                            <EditableDataRow
                                label={inputField.displayName ?? sentenceCase(inputField.name)}
                                inputField={inputField.name}
                                key={'raw_metadata' + inputField.name}
                                row={field}
                                onChange={(editedRow: Row) =>
                                    setEditableMetadata((prevMetadata) => prevMetadata.updateWith(editedRow))
                                }
                            />
                        ) : null;
                    })}
                </Fragment>
            );
        })}
    </>
);

export class EditableSequences {
    private constructor(public readonly rows: Row[]) {}

    static fromInitialData(initialData: SequenceEntryToEdit): EditableSequences {
        return new EditableSequences(mapSequencesToRow(initialData));
    }

    static fromSequenceNames(sequenceNames: string[]): EditableSequences {
        return new EditableSequences(emptyRowsFromSegmentNames(sequenceNames));
    }

    static empty(): EditableSequences {
        return new EditableSequences([]);
    }

    update(editedRow: Row): EditableSequences {
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
                : sequences.map((sequence) => `>${submissionId}_${sequence.key}\n${sequence.value}`).join('\n');

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
export const SequencesForm: FC<SequenceFormProps> = ({ editableSequences, setEditableSequences }) => (
    <>
        <Subtitle title='Unaligned nucleotide sequences' />
        {editableSequences.rows.map((field) => (
            <EditableDataRow
                key={'raw_unaligned' + field.key}
                inputField='NucleotideSequence'
                row={field}
                onChange={(editedRow: Row) =>
                    setEditableSequences((editableSequences) => editableSequences.update(editedRow))
                }
            />
        ))}
    </>
);

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

const mapMetadataToRow = (editedData: SequenceEntryToEdit): Row[] =>
    Object.entries(editedData.originalData.metadata).map(([key, value]) => ({
        key,
        value,
        initialValue: value,
        ...mapErrorsAndWarnings(editedData, key, 'Metadata'),
    }));

const mapSequencesToRow = (editedData: SequenceEntryToEdit): Row[] =>
    Object.entries(editedData.originalData.unalignedNucleotideSequences).map(([key, value]) => ({
        key,
        initialValue: value.toString(),
        value: value.toString(),
        ...mapErrorsAndWarnings(editedData, key, 'NucleotideSequence'),
    }));

const emptyRowsFromSegmentNames = (segmentNames: string[]): Row[] =>
    segmentNames.map((name) => ({
        key: name,
        initialValue: '',
        value: '',
        errors: [],
        warnings: [],
    }));

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
