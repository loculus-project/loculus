import { sentenceCase, snakeCase } from 'change-case';
import { type Dispatch, type FC, Fragment, type SetStateAction, useMemo, useState } from 'react';
import { toast } from 'react-toastify';

import { EditableDataRow, ProcessedDataRow } from './DataRow.tsx';
import type { Row } from './InputField.tsx';
import { getClientLogger } from '../../clientLogger.ts';
import { routes } from '../../routes/routes.ts';
import { backendClientHooks } from '../../services/serviceHooks.ts';
import { ACCESSION_FIELD, SUBMISSION_ID_FIELD } from '../../settings.ts';
import {
    type ProcessingAnnotationSourceType,
    type SequenceEntryToEdit,
    approvedForReleaseStatus,
} from '../../types/backend.ts';
import { type InputField } from '../../types/config.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader.ts';
import { getAccessionVersionString } from '../../utils/extractAccessionVersion.ts';
import { displayConfirmationDialog } from '../ConfirmationDialog.tsx';
import { BoxWithTabsBox, BoxWithTabsTab, BoxWithTabsTabBar } from '../common/BoxWithTabs.tsx';
import { FixedLengthTextViewer } from '../common/FixedLengthTextViewer.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

type EditPageProps = {
    organism: string;
    clientConfig: ClientConfig;
    dataToEdit: SequenceEntryToEdit;
    accessToken: string;
    inputFields: InputField[];
};

const logger = getClientLogger('EditPage');

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

function createMetadataTsv(metadata: Row[], submissionId: string, accession: string): File {
    const tableVals = [
        ...metadata,
        { key: SUBMISSION_ID_FIELD, value: submissionId },
        { key: ACCESSION_FIELD, value: accession },
    ];

    const header = tableVals.map((row) => row.key).join('\t');

    const values = tableVals.map((row) => row.value).join('\t');

    const tsvContent = `${header}\n${values}`;

    return new File([tsvContent], 'metadata.tsv', { type: 'text/tab-separated-values' });
}

function createSequenceFasta(sequences: Row[], submissionId: string): File {
    const fastaContent =
        sequences.length === 1
            ? `>${submissionId}\n${sequences[0].value}`
            : sequences.map((sequence) => `>${submissionId}_${sequence.key}\n${sequence.value}`).join('\n');

    return new File([fastaContent], 'sequences.fasta', { type: 'text/plain' });
}

const InnerEditPage: FC<EditPageProps> = ({
    organism,
    dataToEdit,
    clientConfig,
    accessToken,
    inputFields,
}: EditPageProps) => {
    const [editedMetadata, setEditedMetadata] = useState(mapMetadataToRow(dataToEdit));
    const [editedSequences, setEditedSequences] = useState(mapSequencesToRow(dataToEdit));
    const [processedSequenceTab, setProcessedSequenceTab] = useState(0);

    const isCreatingRevision = dataToEdit.status === approvedForReleaseStatus;

    const { mutate: submitRevision, isLoading: isRevisionLoading } = useSubmitRevision(
        organism,
        clientConfig,
        accessToken,
        dataToEdit,
        (message) => toast.error(message, { position: 'top-center', autoClose: false }),
    );

    const { mutate: submitEdit, isLoading: isEditLoading } = useSubmitEdit(
        organism,
        clientConfig,
        accessToken,
        dataToEdit,
        (message) => toast.error(message, { position: 'top-center', autoClose: false }),
    );

    const submitEditedDataForAccessionVersion = () => {
        if (isCreatingRevision) {
            submitRevision({
                metadataFile: createMetadataTsv(editedMetadata, dataToEdit.submissionId, dataToEdit.accession),
                sequenceFile: createSequenceFasta(editedSequences, dataToEdit.submissionId),
            });
        } else {
            submitEdit({
                accession: dataToEdit.accession,
                version: dataToEdit.version,
                data: {
                    metadata: editedMetadata.reduce((prev, row) => ({ ...prev, [row.key]: row.value }), {}),
                    unalignedNucleotideSequences: editedSequences.reduce(
                        (prev, row) => ({ ...prev, [row.key]: row.value }),
                        {},
                    ),
                },
            });
        }
    };

    const isLoading = isRevisionLoading || isEditLoading;
    const processedSequences = useMemo(() => extractProcessedSequences(dataToEdit), [dataToEdit]);
    const processedInsertions = useMemo(() => extractInsertions(dataToEdit), [dataToEdit]);

    return (
        <>
            <div className='flex items-center mb-4'>
                <h1 className='title'>
                    {isCreatingRevision ? 'Create new revision from' : 'Edit'} {dataToEdit.accession}.
                    {dataToEdit.version}
                </h1>
            </div>

            <table className='customTable'>
                <tbody className='w-full'>
                    <Subtitle title='Original Data' bold />
                    <SubmissionIdRow submissionId={dataToEdit.submissionId} />
                    <EditableOriginalData
                        editedMetadata={editedMetadata.filter(({ key }) => key !== ACCESSION_FIELD)}
                        setEditedMetadata={setEditedMetadata}
                        inputFields={inputFields}
                    />
                    <EditableOriginalSequences
                        editedSequences={editedSequences}
                        setEditedSequences={setEditedSequences}
                    />

                    <Subtitle title='Processed Data' bold />
                    <ProcessedInsertions
                        processedInsertions={processedInsertions}
                        insertionType='nucleotideInsertions'
                    />
                    <ProcessedInsertions
                        processedInsertions={processedInsertions}
                        insertionType='aminoAcidInsertions'
                    />
                    <Subtitle title='Sequences' />
                </tbody>
            </table>

            {processedSequences.length > 0 && (
                <div>
                    <BoxWithTabsTabBar>
                        {processedSequences.map(({ label }, i) => (
                            <BoxWithTabsTab
                                key={label}
                                isActive={i === processedSequenceTab}
                                label={label}
                                onClick={() => setProcessedSequenceTab(i)}
                            />
                        ))}
                    </BoxWithTabsTabBar>
                    <BoxWithTabsBox>
                        {processedSequences[processedSequenceTab].sequence !== null && (
                            <div className='max-h-80 overflow-auto'>
                                <FixedLengthTextViewer
                                    text={processedSequences[processedSequenceTab].sequence}
                                    maxLineLength={100}
                                />
                            </div>
                        )}
                    </BoxWithTabsBox>
                </div>
            )}

            <div className='flex items-center gap-4 mt-4'>
                <button
                    className='btn normal-case'
                    onClick={() =>
                        displayConfirmationDialog({
                            dialogText: 'Do you really want to submit?',
                            onConfirmation: submitEditedDataForAccessionVersion,
                        })
                    }
                    disabled={isLoading}
                >
                    {isLoading && <span className='loading loading-spinner loading-sm mr-2' />}
                    Submit
                </button>

                <button
                    className='btn normal-case'
                    onClick={() => generateAndDownloadFastaFile(editedSequences, dataToEdit)}
                    title={`Download the original, unaligned sequence${
                        editedSequences.length > 1 ? 's' : ''
                    } as provided by the submitter`}
                    disabled={isLoading}
                >
                    Download Sequence{editedSequences.length > 1 ? 's' : ''}
                </button>
            </div>
        </>
    );
};

export const EditPage = withQueryProvider(InnerEditPage);

function useSubmitRevision(
    organism: string,
    clientConfig: ClientConfig,
    accessToken: string,
    reviewData: SequenceEntryToEdit,
    openErrorFeedback: (message: string) => void,
) {
    return backendClientHooks(clientConfig).useRevise(
        {
            params: { organism },
            headers: createAuthorizationHeader(accessToken),
        },
        {
            onSuccess: async () => {
                await logger.info('Successfully submitted revision for ' + getAccessionVersionString(reviewData));
                location.href = routes.userSequenceReviewPage(organism, reviewData.groupId);
            },
            onError: async (error) => {
                const message = `Failed to submit revision for ${getAccessionVersionString(
                    reviewData,
                )} with error '${JSON.stringify(error)})}'`;
                await logger.info(message);
                openErrorFeedback(message);
            },
        },
    );
}

function useSubmitEdit(
    organism: string,
    clientConfig: ClientConfig,
    accessToken: string,
    reviewData: SequenceEntryToEdit,
    openErrorFeedback: (message: string) => void,
) {
    return backendClientHooks(clientConfig).useSubmitReviewedSequence(
        {
            headers: createAuthorizationHeader(accessToken),
            params: { organism },
        },
        {
            onSuccess: async () => {
                await logger.info('Successfully submitted edited data ' + getAccessionVersionString(reviewData));
                location.href = routes.userSequenceReviewPage(organism, reviewData.groupId);
            },
            onError: async (error) => {
                const message = `Failed to submit edited data for ${getAccessionVersionString(
                    reviewData,
                )} with error '${JSON.stringify(error)})}'`;
                await logger.info(message);
                openErrorFeedback(message);
            },
        },
    );
}

function generateAndDownloadFastaFile(editedSequences: Row[], editedData: SequenceEntryToEdit) {
    const accessionVersion = getAccessionVersionString(editedData);
    const fileContent =
        editedSequences.length === 1
            ? `>${accessionVersion}\n${editedSequences[0].value}`
            : editedSequences.map((sequence) => `>${accessionVersion}_${sequence.key}\n${sequence.value}\n`).join('');

    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${accessionVersion}.fasta`;
    a.click();

    URL.revokeObjectURL(url);
}

type SubtitleProps = {
    title: string;
    bold?: boolean;
    customKey?: string;
};
const Subtitle: FC<SubtitleProps> = ({ title, bold, customKey }) => (
    <Fragment key={snakeCase(customKey ?? title) + '_fragment'}>
        <tr key={snakeCase(customKey ?? title) + '_spacing'} className='h-4' />
        <tr key={snakeCase(customKey ?? title)} className='subtitle'>
            <td className={(bold ?? false) ? 'font-semibold' : 'font-normal'} colSpan={3}>
                {title}
            </td>
        </tr>
    </Fragment>
);

type EditableOriginalDataProps = {
    editedMetadata: Row[];
    setEditedMetadata: Dispatch<SetStateAction<Row[]>>;
    inputFields: InputField[];
};
const EditableOriginalData: FC<EditableOriginalDataProps> = ({ editedMetadata, setEditedMetadata, inputFields }) => (
    <>
        <Subtitle title='Metadata' />
        {inputFields.map((inputField) => {
            let field;
            field = editedMetadata.find((editedMetadataField) => editedMetadataField.key === inputField.name);

            if (field === undefined) {
                field = {
                    key: inputField.name,
                    value: '',
                    initialValue: '',
                    warnings: [],
                    errors: [],
                };
            }

            if (!(inputField.noEdit !== undefined && inputField.noEdit)) {
                return (
                    <EditableDataRow
                        label={inputField.displayName ?? sentenceCase(inputField.name)}
                        inputField={inputField.name}
                        key={'raw_metadata' + inputField.name}
                        row={field}
                        onChange={(editedRow: Row) =>
                            setEditedMetadata((prevRows: Row[]) => {
                                const relevantOldRow = prevRows.find((oldRow) => oldRow.key === editedRow.key);

                                if (relevantOldRow !== undefined) {
                                    return prevRows.map((prevRow) =>
                                        prevRow.key === editedRow.key
                                            ? { ...prevRow, value: editedRow.value }
                                            : prevRow,
                                    );
                                } else {
                                    return [...prevRows, editedRow];
                                }
                            })
                        }
                    />
                );
            }
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
    processedInsertions: ReturnType<typeof extractInsertions>;
    insertionType: keyof ReturnType<typeof extractInsertions>;
};
const ProcessedInsertions: FC<ProcessedInsertionsProps> = ({ processedInsertions, insertionType }) => (
    <>
        <Subtitle key={`processed_insertions_${insertionType}`} title={sentenceCase(insertionType)} />
        {Object.entries(processedInsertions[insertionType]).map(([key, value]) => (
            <ProcessedDataRow key={`processed_${insertionType}_${key}`} row={{ key, value: value.join(',') }} />
        ))}
    </>
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

const extractProcessedSequences = (editedData: SequenceEntryToEdit) => {
    return [
        { type: 'unaligned', sequences: editedData.processedData.unalignedNucleotideSequences },
        { type: 'aligned', sequences: editedData.processedData.alignedNucleotideSequences },
        { type: 'gene', sequences: editedData.processedData.alignedAminoAcidSequences },
    ].flatMap(({ type, sequences }) =>
        Object.entries(sequences).map(([sequenceName, sequence]) => {
            let label = sequenceName;
            if (type !== 'gene') {
                if (label === 'main') {
                    label = type === 'unaligned' ? 'Sequence' : 'Aligned';
                } else {
                    label = type === 'unaligned' ? `${sequenceName} (unaligned)` : `${sequenceName} (aligned)`;
                }
            }
            return { label, sequence };
        }),
    );
};

const extractInsertions = (editedData: SequenceEntryToEdit) => ({
    nucleotideInsertions: editedData.processedData.nucleotideInsertions,
    aminoAcidInsertions: editedData.processedData.aminoAcidInsertions,
});

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
