import { useEffect, useState, type Dispatch, type FC, type SetStateAction } from 'react';

import type { UploadAction } from './DataUploadForm';
import type { ColumnMapping } from './FileUpload/ColumnMapping';
import { SequenceEntryUpload } from './FileUpload/SequenceEntryUploadComponent';
import type { ProcessedFile } from './FileUpload/fileProcessing';
import type { InputField } from '../../types/config';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes';
import { EditableMetadata, EditableSequences, MetadataForm, SequencesForm } from '../Edit/InputForm';

export type InputMode = 'form' | 'bulk';

export type SequenceData = {
    type: 'ok';
    metadataFile: File;
    sequenceFile?: File;
};

export type InputError = {
    type: 'error';
    errorMessage: string;
};

export type FileFactory = () => Promise<SequenceData | InputError>;

type FormOrUploadWrapperProps = {
    inputMode: InputMode;
    setFileFactory: Dispatch<SetStateAction<FileFactory | undefined>>;
    organism: string;
    action: UploadAction;
    referenceGenomeSequenceNames: ReferenceGenomesSequenceNames;
    metadataTemplateFields: Map<string, InputField[]>;
    enableConsensusSequences: boolean;
};

/**
 * A component that allows users to upload sequence data. Two modes are supported, see {@link InputMode}.
 * In 'form' mode, a form is displayed, and the user can directly enter stuff into the form to upload their
 * metadata. In 'bulk' mode, the user needs to upload files containing the sequences and metadata.
 * Either way, the component turns the uploaded data into files, so they can be submitted to the API.
 * Set the 'fileCreatorSetter' to get the files - have a look at existing usage on how this works.
 */
export const FormOrUploadWrapper: FC<FormOrUploadWrapperProps> = ({
    inputMode,
    setFileFactory,
    organism,
    action,
    referenceGenomeSequenceNames,
    metadataTemplateFields,
    enableConsensusSequences,
}) => {
    const isMultiSegmented = referenceGenomeSequenceNames.nucleotideSequences.length > 1;
    const [editableMetadata, setEditableMetadata] = useState(EditableMetadata.empty());
    const [editableSequences, setEditableSequences] = useState(
        EditableSequences.fromSequenceNames(referenceGenomeSequenceNames.nucleotideSequences),
    );

    const [metadataFile, setMetadataFile] = useState<ProcessedFile | undefined>(undefined);
    const [sequenceFile, setSequenceFile] = useState<ProcessedFile | undefined>(undefined);
    // The columnMapping can be null; if null -> don't apply mapping.
    const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);

    useEffect(() => {
        setFileFactory(() => {
            return async (): Promise<SequenceData | InputError> => {
                switch (inputMode) {
                    case 'form': {
                        const submissionId = editableMetadata.getSubmissionId();
                        if (!submissionId) {
                            return { type: 'error', errorMessage: 'Please specify a submission ID.' };
                        }
                        const metadataFile = editableMetadata.getMetadataTsv(submissionId);
                        if (!metadataFile) {
                            return { type: 'error', errorMessage: 'Please specify metadata.' };
                        }
                        const sequenceFile = editableSequences.getSequenceFasta(submissionId);
                        if (!sequenceFile && enableConsensusSequences) {
                            return { type: 'error', errorMessage: 'Please enter sequence data.' };
                        }

                        return {
                            type: 'ok',
                            metadataFile,
                            sequenceFile,
                        };
                    }
                    case 'bulk': {
                        let mFile = metadataFile?.inner();
                        if (metadataFile !== undefined && columnMapping !== null) {
                            mFile = await columnMapping.applyTo(metadataFile);
                        }
                        if (mFile === undefined) {
                            return { type: 'error', errorMessage: 'Please specify a metadata file.' };
                        }

                        const sFile = sequenceFile?.inner();
                        if (sFile === undefined) {
                            return { type: 'error', errorMessage: 'Please specify a sequences file.' };
                        }

                        return {
                            type: 'ok',
                            metadataFile: mFile,
                            sequenceFile: sFile,
                        };
                    }
                }
            };
        });
    }, [editableMetadata, editableSequences, metadataFile, sequenceFile, enableConsensusSequences, columnMapping]);

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
                referenceGenomeSequenceNames={referenceGenomeSequenceNames}
                metadataTemplateFields={metadataTemplateFields}
                enableConsensusSequences={enableConsensusSequences}
                isMultiSegmented={isMultiSegmented}
            />
        );
    } else {
        return (
            <table className='customTable'>
                <tbody className='w-full'>
                    <MetadataForm
                        editableMetadata={editableMetadata}
                        setEditableMetadata={setEditableMetadata}
                        groupedInputFields={metadataTemplateFields}
                        isSubmitForm={action === 'submit'}
                    />
                    {enableConsensusSequences && (
                        <SequencesForm
                            editableSequences={editableSequences}
                            setEditableSequences={setEditableSequences}
                        />
                    )}
                </tbody>
            </table>
        );
    }
};
