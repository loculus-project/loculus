import { type FC, useMemo, useState } from 'react';
import { toast } from 'react-toastify';

import { EditableSequenceEntry } from './EditableSequenceEntry.ts';
import type { Row } from './InputField.tsx';
import { InputForm } from './InputForm.tsx';
import { getClientLogger } from '../../clientLogger.ts';
import { routes } from '../../routes/routes.ts';
import { backendClientHooks } from '../../services/serviceHooks.ts';
import { type SequenceEntryToEdit, approvedForReleaseStatus } from '../../types/backend.ts';
import { type InputField, type SubmissionDataTypes } from '../../types/config.ts';
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
    groupedInputFields: Map<string, InputField[]>;
    submissionDataTypes: SubmissionDataTypes;
};

const logger = getClientLogger('EditPage');

const InnerEditPage: FC<EditPageProps> = ({
    organism,
    dataToEdit,
    clientConfig,
    accessToken,
    groupedInputFields,
    submissionDataTypes,
}) => {
    const editableSequenceEntry = new EditableSequenceEntry(dataToEdit);
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
        const metadataFile = editableSequenceEntry.getMetadataTsv(dataToEdit.submissionId, dataToEdit.accession);
        if (metadataFile === undefined) {
            toast.error('Please enter.', { position: 'top-center', autoClose: false });
            return;
        }

        if (isCreatingRevision) {
            submitRevision({
                metadataFile,
                sequenceFile: submissionDataTypes.consensusSequences
                    ? editableSequenceEntry.getSequenceFasta(dataToEdit.submissionId)
                    : undefined,
            });
        } else {
            submitEdit({
                accession: dataToEdit.accession,
                version: dataToEdit.version,
                data: {
                    metadata: editableSequenceEntry.getMetadataRecord(),
                    unalignedNucleotideSequences: editableSequenceEntry.getSequenceRecord(),
                },
            });
        }
    };

    const isLoading = isRevisionLoading || isEditLoading;
    const processedSequences = useMemo(() => extractProcessedSequences(dataToEdit), [dataToEdit]);

    return (
        <>
            <div className='flex items-center mb-4'>
                <h1 className='title'>
                    {isCreatingRevision ? 'Create new revision from' : 'Edit'} {dataToEdit.accession}.
                    {dataToEdit.version}
                </h1>
            </div>
            <InputForm
                submissionId={dataToEdit.submissionId}
                editableSequenceEntry={editableSequenceEntry}
                groupedInputFields={groupedInputFields}
                enableConsensusSequences={submissionDataTypes.consensusSequences}
            />
            {submissionDataTypes.consensusSequences && processedSequences.length > 0 && (
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

                {submissionDataTypes.consensusSequences && (
                    <button
                        className='btn normal-case'
                        onClick={() => generateAndDownloadFastaFile(editableSequenceEntry.editedSequences, dataToEdit)}
                        title={`Download the original, unaligned sequence${
                            editableSequenceEntry.editedSequences.length > 1 ? 's' : ''
                        } as provided by the submitter`}
                        disabled={isLoading}
                    >
                        Download Sequence{editableSequenceEntry.editedSequences.length > 1 ? 's' : ''}
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
