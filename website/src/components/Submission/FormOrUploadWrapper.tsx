import type { Result } from 'neverthrow';
import { useEffect, useState, type Dispatch, type FC, type SetStateAction } from 'react';

import type { UploadAction } from './DataUploadForm';
import type { ColumnMapping } from './FileUpload/ColumnMapping';
import { SequenceEntryUpload } from './FileUpload/SequenceEntryUploadComponent';
import { RawFile, type ProcessedFile } from './FileUpload/fileProcessing';
import type { FileSharingConfig, InputField, SubmissionDataTypes } from '../../types/config';
import { EditableSequences } from '../Edit/EditableSequences';
import { EditableMetadata, MetadataForm } from '../Edit/MetadataForm';
import { SequencesForm } from '../Edit/SequencesForm';
import {
    applyFileMappings,
    getLinkageErrors,
    getSingleSubmissionFileMapping,
    parseSubmissionFileMapping,
    resolveFileMappings,
    validateSubmissionFileMapping,
    type FileMapping,
    type SubmissionFileMapping,
} from './FileUpload/fileMapping';

export type InputMode = 'form' | 'bulk';

/**
 * A wrapper type for a metadata file (TSV) and sequence file (FASTA) which together
 * make up the sequence data.
 * The sequenceFile is optional, because Loculus also can be configured to not require
 * submission of consensus sequences. If consensus sequences are enabled, the file should be
 * there.
 */
export type SequenceData = {
    type: 'ok';
    metadataFile: File;
    sequenceFile?: File;
    submissionId?: string;
};

export type InputError = {
    type: 'error';
    errorMessage: string;
};

/**
 * A function that generates a {@link SequenceData} or {@link InputError} if the user has made a mistake
 * when entering the data (such as, no Submission ID given, or no metadata given).
 */
export type FileFactory = () => Promise<SequenceData | InputError>;

type FormOrUploadWrapperProps = {
    inputMode: InputMode;
    setFileFactory: Dispatch<SetStateAction<FileFactory | undefined>>;
    setSubmissionFileMapping: Dispatch<SetStateAction<Result<SubmissionFileMapping, Error> | undefined>>;
    organism: string;
    action: UploadAction;
    metadataTemplateFields: Map<string, InputField[]>;
    submissionDataTypes: SubmissionDataTypes;
    onError: (message: string) => void;
    fileSharingConfig: FileSharingConfig;
    fileMapping: FileMapping | undefined;
};

/**
 * A component that allows users to upload sequence data. Two modes are supported, see {@link InputMode}.
 * In 'form' mode, a form is displayed, and the user can directly enter stuff into the form to upload their
 * metadata. In 'bulk' mode, the user needs to upload files containing the sequences and metadata.
 * Either way, the component turns the uploaded data into files, so they can be submitted to the API.
 * Set the 'setFileFactory' to get the files - have a look at existing usage on how this works.
 */
export const FormOrUploadWrapper: FC<FormOrUploadWrapperProps> = ({
    inputMode,
    setFileFactory,
    setSubmissionFileMapping,
    organism,
    action,
    metadataTemplateFields,
    submissionDataTypes,
    onError,
    fileSharingConfig,
    fileMapping,
}) => {
    const extraFilesEnabled = submissionDataTypes.files?.enabled ?? false;
    const enableConsensusSequences = submissionDataTypes.consensusSequences;
    const [editableMetadata, setEditableMetadata] = useState(EditableMetadata.empty());
    const [editableSequences, setEditableSequences] = useState(
        EditableSequences.empty(submissionDataTypes.maxSequencesPerEntry),
    );

    const [metadataFile, setMetadataFile] = useState<ProcessedFile | undefined>(undefined);
    const [sequenceFile, setSequenceFile] = useState<ProcessedFile | undefined>(undefined);
    // The columnMapping can be null; if null -> don't apply mapping.
    const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);

    useEffect(() => {
        if (!extraFilesEnabled) return;

        const state = { cancelled: false };
        void (async () => {
            if (!metadataFile) {
                setSubmissionFileMapping(undefined);
                return;
            }

            let mFile = metadataFile;
            if (columnMapping !== null) {
                const metadataWithColumnMapping = await columnMapping.applyTo(metadataFile);
                if (state.cancelled) return;
                if (metadataWithColumnMapping.isErr()) {
                    setSubmissionFileMapping(undefined);
                    onError(metadataWithColumnMapping.error.message);
                    return;
                }
                mFile = metadataWithColumnMapping.value;
            }

            const submissionFileMapping = await parseSubmissionFileMapping(
                mFile,
                submissionDataTypes.files?.categories?.map((category) => category.name) ?? [],
            );
            if (state.cancelled) return;
            setSubmissionFileMapping(submissionFileMapping);
            if (submissionFileMapping.isErr()) onError(submissionFileMapping.error.message);
        })();
        return () => {
            state.cancelled = true;
        };
    }, [metadataFile, columnMapping, extraFilesEnabled]);

    useEffect(() => {
        setFileFactory(() => {
            // Returns a function that the parent component can call to get the files needed for submission
            return async (): Promise<SequenceData | InputError> => {
                switch (inputMode) {
                    case 'form': {
                        const submissionId = editableMetadata.getSubmissionId();
                        if (!submissionId) {
                            return { type: 'error', errorMessage: 'Please specify an ID.' };
                        }
                        const fastaIds = enableConsensusSequences ? editableSequences.getFastaIds() : undefined;
                        const metadataFile = editableMetadata.getMetadataTsv(
                            undefined,
                            undefined,
                            fastaIds,
                            submissionDataTypes.files?.categories,
                        );
                        if (!metadataFile) {
                            return { type: 'error', errorMessage: 'Please specify metadata.' };
                        }
                        const sequenceFile = editableSequences.getSequenceFasta();
                        if (!sequenceFile && enableConsensusSequences) {
                            return { type: 'error', errorMessage: 'Please enter sequence data.' };
                        }

                        let mFile: ProcessedFile = new RawFile(metadataFile);

                        if (extraFilesEnabled && fileMapping !== undefined) {
                            const submissionFileMapping = getSingleSubmissionFileMapping(submissionId, fileMapping);

                            const validation = validateSubmissionFileMapping(submissionFileMapping, fileSharingConfig);
                            if (validation.isErr()) {
                                return { type: 'error', errorMessage: validation.error.message };
                            }

                            const metadataWithFileMapping = await applyFileMappings(mFile, submissionFileMapping);
                            if (metadataWithFileMapping.isErr()) {
                                return { type: 'error', errorMessage: metadataWithFileMapping.error.message };
                            }

                            mFile = metadataWithFileMapping.value;
                        }

                        return {
                            type: 'ok',
                            metadataFile: mFile.inner(),
                            sequenceFile,
                            submissionId,
                        };
                    }
                    case 'bulk': {
                        if (!metadataFile) {
                            return { type: 'error', errorMessage: 'Please specify a metadata file.' };
                        }

                        if (enableConsensusSequences && !sequenceFile) {
                            return { type: 'error', errorMessage: 'Please specify a sequences file.' };
                        }

                        let mFile = metadataFile;

                        if (columnMapping !== null) {
                            const metadataWithColumnMapping = await columnMapping.applyTo(metadataFile);
                            if (metadataWithColumnMapping.isErr()) {
                                return { type: 'error', errorMessage: metadataWithColumnMapping.error.message };
                            }
                            mFile = metadataWithColumnMapping.value;
                        }

                        if (extraFilesEnabled) {
                            // Parse submission file mapping from the metadata
                            const submissionFileMapping = await parseSubmissionFileMapping(
                                mFile,
                                submissionDataTypes.files?.categories?.map((category) => category.name) ?? [],
                            );
                            if (submissionFileMapping.isErr()) {
                                return { type: 'error', errorMessage: submissionFileMapping.error.message };
                            }

                            // Validate the submission file mapping
                            const validation = validateSubmissionFileMapping(
                                submissionFileMapping.value,
                                fileSharingConfig,
                            );
                            if (validation.isErr()) {
                                return { type: 'error', errorMessage: validation.error.message };
                            }

                            // Resolve the submission file mapping against file mapping of uploads
                            const { submissionFileMapping: resolvedFileMapping, fileLinkage } = resolveFileMappings(
                                submissionFileMapping.value,
                                fileMapping,
                            );
                            const linkageErrorMessage = getLinkageErrors(fileLinkage);
                            if (linkageErrorMessage !== undefined) {
                                return { type: 'error', errorMessage: linkageErrorMessage };
                            }

                            // Apply resolved mapping to metadata file
                            const metadataWithFileMapping = await applyFileMappings(mFile, resolvedFileMapping);
                            if (metadataWithFileMapping.isErr()) {
                                return { type: 'error', errorMessage: metadataWithFileMapping.error.message };
                            }
                            mFile = metadataWithFileMapping.value;
                        }

                        return {
                            type: 'ok',
                            metadataFile: mFile.inner(),
                            sequenceFile: sequenceFile?.inner(),
                        };
                    }
                }
            };
        });
    }, [
        editableMetadata,
        editableSequences,
        metadataFile,
        sequenceFile,
        enableConsensusSequences,
        columnMapping,
        fileMapping,
        extraFilesEnabled,
    ]);

    if (inputMode === 'bulk') {
        return (
            <SequenceEntryUpload
                organism={organism}
                action={action}
                metadataFile={metadataFile}
                setMetadataFile={setMetadataFile}
                sequenceFile={sequenceFile}
                setSequenceFile={setSequenceFile}
                columnMapping={columnMapping}
                setColumnMapping={setColumnMapping}
                metadataTemplateFields={metadataTemplateFields}
                submissionDataTypes={submissionDataTypes}
            />
        );
    } else {
        return (
            <>
                <table className='customTable'>
                    <tbody className='w-full'>
                        <MetadataForm
                            editableMetadata={editableMetadata}
                            setEditableMetadata={setEditableMetadata}
                            groupedInputFields={metadataTemplateFields}
                            isSubmitForm={action === 'submit'}
                        />
                    </tbody>
                </table>
                {enableConsensusSequences && (
                    <SequencesForm editableSequences={editableSequences} setEditableSequences={setEditableSequences} />
                )}
            </>
        );
    }
};
