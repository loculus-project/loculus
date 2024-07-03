import { sentenceCase, snakeCase } from 'change-case';
import { type Dispatch, type FC, Fragment, type SetStateAction, useMemo, useRef, useState } from 'react';

import { EditableDataRow, ProcessedDataRow } from './DataRow.tsx';
import type { Row } from './InputField.tsx';
import { getClientLogger } from '../../clientLogger.ts';
import { routes } from '../../routes/routes.ts';
import { backendClientHooks } from '../../services/serviceHooks.ts';
import { ACCESSION_FIELD } from '../../settings.ts';
import type { MetadataRecord, ProcessingAnnotationSourceType, SequenceEntryToEdit } from '../../types/backend.ts';
import { type InputField } from '../../types/config.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader.ts';
import { displayMetadataField } from '../../utils/displayMetadataField.ts';
import { getAccessionVersionString } from '../../utils/extractAccessionVersion.ts';
import { ConfirmationDialog } from '../DeprecatedConfirmationDialog.tsx';
import { BoxWithTabsBox, BoxWithTabsTab, BoxWithTabsTabBar } from '../common/BoxWithTabs.tsx';
import { FixedLengthTextViewer } from '../common/FixedLengthTextViewer.tsx';
import { ManagedErrorFeedback, useErrorFeedbackState } from '../common/ManagedErrorFeedback.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

type EditPageProps = {
    organism: string;
    clientConfig: ClientConfig;
    dataToEdit: SequenceEntryToEdit;
    accessToken: string;
    inputFields: InputField[];
};

const logger = getClientLogger('EditPage');

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

    const { errorMessage, isErrorOpen, openErrorFeedback, closeErrorFeedback } = useErrorFeedbackState();

    const dialogRef = useRef<HTMLDialogElement>(null);

    const { mutate: submitEditedSequence } = useSubmitEditedSequence(
        organism,
        clientConfig,
        accessToken,
        dataToEdit,
        openErrorFeedback,
    );

    const handleOpenConfirmationDialog = () => {
        if (dialogRef.current) {
            dialogRef.current.showModal();
        }
    };

    const submitEditedDataForAccessionVersion = async () => {
        const data = {
            accession: dataToEdit.accession,
            version: dataToEdit.version,
            data: {
                metadata: editedMetadata.reduce((prev, row) => ({ ...prev, [row.key]: row.value }), {}),
                unalignedNucleotideSequences: editedSequences.reduce(
                    (prev, row) => ({ ...prev, [row.key]: row.value }),
                    {},
                ),
            },
        };
        submitEditedSequence(data);
    };

    const processedSequences = useMemo(() => extractProcessedSequences(dataToEdit), [dataToEdit]);
    const processedInsertions = useMemo(() => extractInsertions(dataToEdit), [dataToEdit]);

    return (
        <>
            <ManagedErrorFeedback message={errorMessage} open={isErrorOpen} onClose={closeErrorFeedback} />

            <div className='flex items-center gap-4'>
                <button className='btn normal-case' onClick={handleOpenConfirmationDialog}>
                    Submit
                </button>

                <button
                    className='btn normal-case'
                    onClick={() => generateAndDownloadFastaFile(editedSequences, dataToEdit)}
                    title={`Download the original, unaligned sequence${
                        editedSequences.length > 1 ? 's' : ''
                    } as provided by the submitter`}
                >
                    Download Sequence{editedSequences.length > 1 ? 's' : ''}
                </button>
            </div>

            <dialog ref={dialogRef} className='modal'>
                <ConfirmationDialog
                    dialogText='Do you really want to submit?'
                    onConfirmation={submitEditedDataForAccessionVersion}
                />
            </dialog>

            <table className='customTable'>
                <tbody className='w-full'>
                    <Subtitle title='Original Data' bold />
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
                    <ProcessedMetadata processedMetadata={dataToEdit.processedData.metadata} />
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
        </>
    );
};

export const EditPage = withQueryProvider(InnerEditPage);

function useSubmitEditedSequence(
    organism: string,
    clientConfig: ClientConfig,
    accessToken: string,
    reviewData: SequenceEntryToEdit,
    openErrorFeedback: (message: string) => void,
) {
    return backendClientHooks(clientConfig).useSubmitReviewedSequence(
        { headers: createAuthorizationHeader(accessToken), params: { organism } },
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
            <td className={bold ?? false ? 'font-semibold' : 'font-normal'} colSpan={3}>
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

            return (
                <EditableDataRow
                    label={inputField.displayName ?? sentenceCase(inputField.name)}
                    key={'raw_metadata' + inputField.name}
                    row={field}
                    onChange={(editedRow: Row) =>
                        setEditedMetadata((prevRows: Row[]) => {
                            const relevantOldRow = prevRows.find((oldRow) => oldRow.key === editedRow.key);

                            if (relevantOldRow !== undefined) {
                                return prevRows.map((prevRow) =>
                                    prevRow.key === editedRow.key ? { ...prevRow, value: editedRow.value } : prevRow,
                                );
                            } else {
                                return [...prevRows, editedRow];
                            }
                        })
                    }
                />
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

type ProcessedMetadataProps = {
    processedMetadata: MetadataRecord;
};
const ProcessedMetadata: FC<ProcessedMetadataProps> = ({ processedMetadata }) => (
    <>
        <Subtitle title='Metadata' customKey='preprocessing_metadata' />
        {Object.entries(processedMetadata).map(([key, value]) => (
            <ProcessedDataRow
                label={sentenceCase(key)}
                key={'processed' + key}
                row={{ key: sentenceCase(key), value: displayMetadataField(value) }}
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
        .filter((error) => error.source.find((source) => source.name === key && source.type === type) !== undefined)
        .map((error) => error.message),
    warnings: (editedData.warnings ?? [])
        .filter((warning) => warning.source.find((source) => source.name === key && source.type === type) !== undefined)
        .map((warning) => warning.message),
});
