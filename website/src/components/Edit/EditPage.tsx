import { type FC, useState } from 'react';
import { toast } from 'react-toastify';

import { EditableSequences } from './EditableSequences.ts';
import { EditableMetadata, MetadataForm, SubmissionIdRow, Subtitle } from './MetadataForm.tsx';
import { SequencesForm } from './SequencesForm.tsx';
import { getClientLogger } from '../../clientLogger.ts';
import { routes } from '../../routes/routes.ts';
import { backendClientHooks } from '../../services/serviceHooks.ts';
import { type FilesBySubmissionId, type SequenceEntryToEdit, approvedForReleaseStatus } from '../../types/backend.ts';
import { type InputField, type SubmissionDataTypes } from '../../types/config.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader.ts';
import { getAccessionVersionString } from '../../utils/extractAccessionVersion.ts';
import { isAxiosErrorWithProblemDetail } from '../../utils/isAxiosErrorWithProblemDetail.ts';
import { displayConfirmationDialog } from '../ConfirmationDialog.tsx';
import { ExtraFilesUpload } from '../Submission/DataUploadForm.tsx';
import { Button } from '../common/Button';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

type EditPageProps = {
    organism: string;
    clientConfig: ClientConfig;
    dataToEdit: SequenceEntryToEdit;
    accessToken: string;
    groupedInputFields: Map<string, InputField[]>;
    submissionDataTypes: SubmissionDataTypes;
};

const logger = getClientLogger('EditPage');

/**
 * Extracts the detail field from a backend error response
 */
function getErrorDetail(error: unknown): string {
    if (isAxiosErrorWithProblemDetail(error)) {
        return error.response.data.detail;
    }
    return JSON.stringify(error);
}

const InnerEditPage: FC<EditPageProps> = ({
    organism,
    dataToEdit,
    clientConfig,
    accessToken,
    groupedInputFields,
    submissionDataTypes,
}) => {
    const [editableMetadata, setEditableMetadata] = useState(EditableMetadata.fromInitialData(dataToEdit));
    const [editableSequences, setEditableSequences] = useState(
        EditableSequences.fromInitialData(dataToEdit, submissionDataTypes.maxSequencesPerEntry),
    );
    const [fileMapping, setFileMapping] = useState<FilesBySubmissionId | undefined>(undefined);

    const isCreatingRevision = dataToEdit.status === approvedForReleaseStatus;
    const extraFilesEnabled = submissionDataTypes.files?.enabled ?? false;

    const { mutate: submitRevision, isPending: isRevisionPending } = useSubmitRevision(
        organism,
        clientConfig,
        accessToken,
        dataToEdit,
        (message) => toast.error(message, { position: 'top-center', autoClose: false }),
    );

    const { mutate: submitEdit, isPending: isEditPending } = useSubmitEdit(
        organism,
        clientConfig,
        accessToken,
        dataToEdit,
        (message) => toast.error(message, { position: 'top-center', autoClose: false }),
    );

    const submitEditedDataForAccessionVersion = () => {
        if (isCreatingRevision) {
            const fastaIds = submissionDataTypes.consensusSequences ? editableSequences.getFastaIds() : undefined;
            const metadataFile = editableMetadata.getMetadataTsv(
                dataToEdit.submissionId,
                dataToEdit.accession,
                fastaIds,
            );
            if (metadataFile === undefined) {
                toast.error('Please enter metadata.', { position: 'top-center', autoClose: false });
                return;
            }

            let fileMappingWithSubmissionId: FilesBySubmissionId | undefined;
            if (extraFilesEnabled && fileMapping !== undefined && Object.keys(fileMapping).length > 0) {
                const files = Object.values(fileMapping)[0];
                fileMappingWithSubmissionId = { [dataToEdit.submissionId]: files };
            }

            if (!submissionDataTypes.consensusSequences) {
                submitRevision({
                    metadataFile,
                    fileMapping: fileMappingWithSubmissionId,
                });
                return;
            }
            const sequenceFile = editableSequences.getSequenceFasta();
            if (!sequenceFile) {
                toast.error('Please enter a sequence.', {
                    position: 'top-center',
                    autoClose: false,
                });
                return;
            }
            submitRevision({
                metadataFile,
                sequenceFile,
                fileMapping: fileMappingWithSubmissionId,
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

    const isPending = isRevisionPending || isEditPending;

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
                    <Subtitle title='Original data' bold />
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
                    <SequencesForm
                        editableSequences={editableSequences}
                        setEditableSequences={setEditableSequences}
                        dataToEdit={dataToEdit}
                        isLoading={isPending}
                    />
                </div>
            )}
            {isCreatingRevision && extraFilesEnabled && (
                <div className='mt-4'>
                    <ExtraFilesUpload
                        accessToken={accessToken}
                        clientConfig={clientConfig}
                        inputMode='form'
                        groupId={dataToEdit.groupId}
                        fileCategories={submissionDataTypes.files?.categories ?? []}
                        setFileMapping={setFileMapping}
                        onError={(msg) => toast.error(msg, { position: 'top-center', autoClose: false })}
                    />
                </div>
            )}
            <div className='flex items-center gap-4 mt-4'>
                <Button
                    className='btn normal-case'
                    onClick={() =>
                        displayConfirmationDialog({
                            dialogText: 'Do you really want to submit?',
                            onConfirmation: submitEditedDataForAccessionVersion,
                        })
                    }
                    disabled={isPending}
                >
                    {isPending && <span className='loading loading-spinner loading-sm mr-2' />}
                    Submit
                </Button>
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
            onSuccess: () => {
                void logger.info('Successfully submitted revision for ' + getAccessionVersionString(reviewData));
                location.href = routes.userSequenceReviewPage(organism, reviewData.groupId);
            },
            onError: (error) => {
                const errorDetail = getErrorDetail(error);
                const message = `Failed to submit revision for ${getAccessionVersionString(
                    reviewData,
                )}: ${errorDetail}`;
                void logger.info(message);
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
            onSuccess: () => {
                void logger.info('Successfully submitted edited data ' + getAccessionVersionString(reviewData));
                location.href = routes.userSequenceReviewPage(organism, reviewData.groupId);
            },
            onError: (error) => {
                const errorDetail = getErrorDetail(error);
                const message = `Failed to submit edited data for ${getAccessionVersionString(
                    reviewData,
                )}: ${errorDetail}`;
                void logger.info(message);
                openErrorFeedback(message);
            },
        },
    );
}
