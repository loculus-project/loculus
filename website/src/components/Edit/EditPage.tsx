import { isErrorFromAlias } from '@zodios/core';
import { type FC, useState } from 'react';
import { toast } from 'react-toastify';

import { EditableSequences } from './EditableSequences.ts';
import { EditableMetadata, MetadataForm, SubmissionIdRow, Subtitle } from './MetadataForm.tsx';
import { SequencesForm } from './SequencesForm.tsx';
import { getClientLogger } from '../../clientLogger.ts';
import { routes } from '../../routes/routes.ts';
import { backendApi } from '../../services/backendApi.ts';
import { backendClientHooks } from '../../services/serviceHooks.ts';
import { type SequenceEntryToEdit, approvedForReleaseStatus } from '../../types/backend.ts';
import { type InputField, type SubmissionDataTypes } from '../../types/config.ts';
import { getLatestAccessionVersionForRevision, type SequenceEntryHistory } from '../../types/lapis.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader.ts';
import { getAccessionVersionString, parseAccessionVersionFromString } from '../../utils/extractAccessionVersion.ts';
import { displayConfirmationDialog } from '../ConfirmationDialog.tsx';
import { SequenceEntryHistoryMenu } from '../SequenceDetailsPage/SequenceEntryHistoryMenu.tsx';
import { ExtraFilesUpload } from '../Submission/DataUploadForm.tsx';
import { applyFileMappings, type FileMapping } from '../Submission/FileUpload/fileMapping.ts';
import { Button } from '../common/Button';
import ErrorBox from '../common/ErrorBox';
import { Spinner } from '../common/Spinner';
import { withQueryProvider } from '../common/withQueryProvider.tsx';

type EditPageProps = {
    organism: string;
    clientConfig: ClientConfig;
    dataToEdit: SequenceEntryToEdit;
    accessToken: string;
    groupedInputFields: Map<string, InputField[]>;
    submissionDataTypes: SubmissionDataTypes;
    sequenceEntryHistory?: SequenceEntryHistory;
};

const logger = getClientLogger('EditPage');

/**
 * Extracts the detail field from a backend error response
 */
function getErrorDetail(error: unknown): string {
    if (
        isErrorFromAlias(backendApi, 'revise', error) ||
        isErrorFromAlias(backendApi, 'submitReviewedSequence', error)
    ) {
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
    sequenceEntryHistory,
}) => {
    const [editableMetadata, setEditableMetadata] = useState(EditableMetadata.fromInitialData(dataToEdit));
    const [editableSequences, setEditableSequences] = useState(
        EditableSequences.fromInitialData(dataToEdit, submissionDataTypes.maxSequencesPerEntry),
    );

    const extraFilesEnabled = submissionDataTypes.files?.enabled ?? false;
    const [fileMapping, setFileMapping] = useState<FileMapping | undefined>(() => {
        const previousFiles = dataToEdit.submittedData.files;
        if (!previousFiles) return undefined;
        return new Map(
            Object.entries(previousFiles).map(([category, files]) => [
                category,
                new Map(files.map((file) => [file.name, { name: file.name, path: file.name, fileId: file.fileId }])),
            ]),
        );
    });

    const isCreatingRevision = dataToEdit.status === approvedForReleaseStatus;

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

    const submitEditedDataForAccessionVersion = async () => {
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

            let finalMetadataFile = metadataFile;
            const finalSubmissionFileMapping = new Map([[dataToEdit.submissionId, fileMapping ?? new Map()]]);

            if (extraFilesEnabled) {
                finalMetadataFile = await applyFileMappings(metadataFile, finalSubmissionFileMapping);
            }

            if (!submissionDataTypes.consensusSequences) {
                submitRevision({
                    metadataFile: finalMetadataFile,
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
                metadataFile: finalMetadataFile,
                sequenceFile,
            });
        } else {
            const fileMappingForEdit =
                extraFilesEnabled && fileMapping !== undefined
                    ? Object.fromEntries(
                          [...fileMapping].map(([category, files]) => [
                              category,
                              [...files.values()].map((file) => ({ fileId: file.fileId!, name: file.name })),
                          ]),
                      )
                    : null;
            submitEdit({
                accession: dataToEdit.accession,
                version: dataToEdit.version,
                data: {
                    metadata: editableMetadata.getMetadataRecord(),
                    unalignedNucleotideSequences: editableSequences.getSequenceRecord(),
                    files: fileMappingForEdit,
                },
            });
        }
    };

    const isPending = isRevisionPending || isEditPending;
    const latestVersionForRevision = sequenceEntryHistory
        ? getLatestAccessionVersionForRevision(sequenceEntryHistory)?.version
        : undefined;
    const revisePageRoute = (accession: string, version: number | undefined) => {
        return routes.revisePage(organism, dataToEdit.groupId, 'form', accession, version?.toString());
    };

    return (
        <>
            <div className='flex items-center justify-between mb-4'>
                <h1 className='title'>
                    {isCreatingRevision ? 'Create new revision from' : 'Edit'} {dataToEdit.accession}.
                    {dataToEdit.version}
                </h1>
                {sequenceEntryHistory && sequenceEntryHistory.length > 1 && (
                    <SequenceEntryHistoryMenu
                        sequenceEntryHistory={sequenceEntryHistory}
                        accessionVersion={getAccessionVersionString(dataToEdit)}
                        handleLink={(accessionVersion) => {
                            const { accession, version } = parseAccessionVersionFromString(accessionVersion);
                            return revisePageRoute(accession, version);
                        }}
                    />
                )}
            </div>
            {isCreatingRevision &&
                latestVersionForRevision !== undefined &&
                dataToEdit.version < latestVersionForRevision && (
                    <ErrorBox
                        title='This is not the latest version of this sequence entry.'
                        level='warning'
                        className='mb-2'
                    >
                        <div className='space-y-2 mt-2'>
                            <p>By revising from this version, existing changes from later versions will be lost.</p>
                            <p>
                                To revise from the latest version, click{' '}
                                <a href={revisePageRoute(dataToEdit.accession, latestVersionForRevision)}>here</a>.
                            </p>
                        </div>
                    </ErrorBox>
                )}
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
            {extraFilesEnabled && (
                <div className='mt-4'>
                    <ExtraFilesUpload
                        accessToken={accessToken}
                        clientConfig={clientConfig}
                        inputMode='form'
                        groupId={dataToEdit.groupId}
                        fileCategories={submissionDataTypes.files?.categories ?? []}
                        fileMapping={fileMapping}
                        setFileMapping={setFileMapping}
                        onError={(msg) => toast.error(msg, { position: 'top-center', autoClose: false })}
                    />
                </div>
            )}
            <div className={isCreatingRevision ? 'flex justify-end gap-x-6' : 'flex items-center gap-4 mt-4'}>
                <Button
                    variant='primary'
                    onClick={() =>
                        displayConfirmationDialog({
                            dialogText: 'Do you really want to submit?',
                            onConfirmation: submitEditedDataForAccessionVersion,
                        })
                    }
                    disabled={isPending}
                >
                    {isPending && <Spinner size='sm' className='mr-2' />}
                    {isCreatingRevision ? 'Upload and proceed to Approval' : 'Submit edits and proceed to Approval'}
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
            onSuccess: async () => {
                await logger.info('Successfully submitted revision for ' + getAccessionVersionString(reviewData));
                location.href = routes.userSequenceReviewPage(organism, reviewData.groupId);
            },
            onError: async (error) => {
                const errorDetail = getErrorDetail(error);
                const message = `Failed to submit revision for ${getAccessionVersionString(
                    reviewData,
                )}: ${errorDetail}`;
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
                const errorDetail = getErrorDetail(error);
                const message = `Failed to submit edited data for ${getAccessionVersionString(
                    reviewData,
                )}: ${errorDetail}`;
                await logger.info(message);
                openErrorFeedback(message);
            },
        },
    );
}
