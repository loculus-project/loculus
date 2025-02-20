import { sentenceCase, snakeCase } from 'change-case';
import { Fragment, type Dispatch, type FC, type SetStateAction } from 'react';

import { EditableDataRow, ProcessedDataRow } from './DataRow.tsx';
import { EditableSequenceEntry, type ProcessedInsertions } from './EditableSequenceEntry.ts';
import type { Row } from './InputField';
import type { InputField } from '../../types/config';

interface InputFormProps {
    /* SubmissionId for displaying - if available. */
    submissionId?: string;

    /* The data to be edited. */
    editableSequenceEntry: EditableSequenceEntry;

    /* Input fields grouped by their header. Used to sort and group the input fields in the form. */
    groupedInputFields: Map<string, InputField[]>;

    /* Whether sequence data is to be submitted/edited. If false, the relevant field(s) are not shown. */
    enableConsensusSequences: boolean;
}

/**
 * Input form used for submitting, revising or editing a sequence and it's metadata.
 */
export const InputForm: FC<InputFormProps> = ({
    submissionId,
    editableSequenceEntry,
    groupedInputFields,
    enableConsensusSequences,
}) => {
    return (
        <table className='customTable'>
            <tbody className='w-full'>
                <Subtitle title='Original Data' bold />
                {submissionId && <SubmissionIdRow submissionId={submissionId} />}
                <EditableOriginalData
                    editedMetadata={editableSequenceEntry.editedMetadata}
                    setEditedMetadata={editableSequenceEntry.setEditedMetadata}
                    groupedInputFields={groupedInputFields}
                />
                {enableConsensusSequences && (
                    <EditableOriginalSequences
                        editedSequences={editableSequenceEntry.editedSequences}
                        setEditedSequences={editableSequenceEntry.setEditedSequences}
                    />
                )}

                <Subtitle title='Processed Data' bold />
                {enableConsensusSequences && (
                    <>
                        <ProcessedInsertions
                            processedInsertions={editableSequenceEntry.processedInsertions}
                            insertionType='nucleotideInsertions'
                        />
                        <ProcessedInsertions
                            processedInsertions={editableSequenceEntry.processedInsertions}
                            insertionType='aminoAcidInsertions'
                        />
                        <Subtitle title='Sequences' />
                    </>
                )}
            </tbody>
        </table>
    );
};

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

type EditableOriginalDataProps = {
    editedMetadata: Row[];
    setEditedMetadata: Dispatch<SetStateAction<Row[]>>;
    groupedInputFields: Map<string, InputField[]>;
};
const EditableOriginalData: FC<EditableOriginalDataProps> = ({
    editedMetadata,
    setEditedMetadata,
    groupedInputFields,
}) => (
    <>
        <Subtitle title='Metadata' />
        {Array.from(groupedInputFields.entries()).map(([group, fields]) => {
            if (fields.length === 0) return undefined;
            return (
                <Fragment key={group}>
                    <Subtitle title={group} small />
                    {fields.map((inputField) => {
                        const field = editedMetadata.find(
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
                                    setEditedMetadata((prevRows) => {
                                        const relevantOldRow = prevRows.find((oldRow) => oldRow.key === editedRow.key);
                                        return relevantOldRow
                                            ? prevRows.map((prevRow) =>
                                                  prevRow.key === editedRow.key
                                                      ? { ...prevRow, value: editedRow.value }
                                                      : prevRow,
                                              )
                                            : [...prevRows, editedRow];
                                    })
                                }
                            />
                        ) : null;
                    })}
                </Fragment>
            );
        })}
    </>
);

type EditableOriginalSequencesProps = {
    editedSequences: Row[];
    setEditedSequences: Dispatch<SetStateAction<Row[]>>;
};
const EditableOriginalSequences: FC<EditableOriginalSequencesProps> = ({ editedSequences, setEditedSequences }) => (
    <>
        <Subtitle title='Unaligned nucleotide sequences' />
        {editedSequences.map((field) => (
            <EditableDataRow
                key={'raw_unaligned' + field.key}
                inputField='NucleotideSequence'
                row={field}
                onChange={(editedRow: Row) =>
                    setEditedSequences((prevRows: Row[]) =>
                        prevRows.map((prevRow) =>
                            prevRow.key === editedRow.key ? { ...prevRow, value: editedRow.value } : prevRow,
                        ),
                    )
                }
            />
        ))}
    </>
);

type ProcessedInsertionsProps = {
    processedInsertions: ProcessedInsertions;
    insertionType: keyof ProcessedInsertions;
};
const ProcessedInsertions: FC<ProcessedInsertionsProps> = ({ processedInsertions, insertionType }) => (
    <>
        <Subtitle key={`processed_insertions_${insertionType}`} title={sentenceCase(insertionType)} />
        {Object.entries(processedInsertions[insertionType]).map(([key, value]) => (
            <ProcessedDataRow key={`processed_${insertionType}_${key}`} row={{ key, value: value.join(',') }} />
        ))}
    </>
);

type SubmissionProps = {
    submissionId: string;
};

const SubmissionIdRow: FC<SubmissionProps> = ({ submissionId }) => (
    <tr>
        <td className='w-1/4'>Submission ID:</td>
        <td className='pr-3 text-right '></td>
        <td className='w-full'>{submissionId}</td>
    </tr>
);
