import { type FC, useState } from 'react';
import { toast } from 'react-toastify';

import type { Row } from './InputField.tsx';
import { EditableMetadata, MetadataForm, SubmissionIdRow, Subtitle } from './MetadataForm.tsx';
import { EditableSequences, SequencesForm } from './SequencesForm.tsx';
import { getClientLogger } from '../../clientLogger.ts';
import { routes } from '../../routes/routes.ts';
import { backendClientHooks } from '../../services/serviceHooks.ts';
import { type SequenceEntryToEdit, approvedForReleaseStatus } from '../../types/backend.ts';
import { type InputField, type SubmissionDataTypes } from '../../types/config.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader.ts';
import { getAccessionVersionString } from '../../utils/extractAccessionVersion.ts';
import { displayConfirmationDialog } from '../ConfirmationDialog.tsx';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

type EditPageProps = {
    organism: string;
    clientConfig: ClientConfig;
    dataToEdit: SequenceEntryToEdit;
    segmentNames: string[];
    accessToken: string;
    groupedInputFields: Map<string, InputField[]>;
    submissionDataTypes: SubmissionDataTypes;
};

const logger = getClientLogger('EditPage');

const InnerEditPage: FC<EditPageProps> = ({
    organism,
    dataToEdit,
    segmentNames,
    clientConfig,
    accessToken,
    groupedInputFields,
    submissionDataTypes,
}) => {
    const [editableMetadata, setEditableMetadata] = useState(EditableMetadata.fromInitialData(dataToEdit));
    const [editableSequences, setEditableSequences] = useState(
        EditableSequences.fromInitialData(dataToEdit, segmentNames),
    );

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
        const metadataFile = editableMetadata.getMetadataTsv(dataToEdit.submissionId, dataToEdit.accession);
        if (metadataFile === undefined) {
            toast.error('Please enter metadata.', { position: 'top-center', autoClose: false });
            return;
        }

        if (isCreatingRevision) {
            submitRevision({
                metadataFile,
                sequenceFile: submissionDataTypes.consensusSequences
                    ? editableSequences.getSequenceFasta(dataToEdit.submissionId)
                    : undefined,
            });
        } else {
            submitEdit({
                accession: dataToEdit.accession,
                version: dataToEdit.version,
                data: {
                    metadata: editableMetadata.getMetadataRecord(),
                    unalignedNucleotideSequences: editableSequences.getSequenceRecord(),
                },
            });
        }
    };

    const isLoading = isRevisionLoading || isEditLoading;

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
                    <MetadataForm
                        editableMetadata={editableMetadata}
                        setEditableMetadata={setEditableMetadata}
                        groupedInputFields={groupedInputFields}
                    />
                </tbody>
            </table>
            {submissionDataTypes.consensusSequences && (
                <div className='mt-4 space-y-4'>
                    <SequencesForm editableSequences={editableSequences} setEditableSequences={setEditableSequences} />
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

                {submissionDataTypes.consensusSequences && (
                    <button
                        className='btn normal-case'
                        onClick={() => generateAndDownloadFastaFile(editableSequences.rows, dataToEdit)}
                        title={`Download the original, unaligned sequence${
                            editableSequences.rows.length > 1 ? 's' : ''
                        } as provided by the submitter`}
                        disabled={isLoading}
                    >
                        Download Sequence{editableSequences.rows.length > 1 ? 's' : ''}
                    </button>
                )}
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
