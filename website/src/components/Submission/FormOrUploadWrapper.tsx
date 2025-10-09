import { useEffect, useState, type Dispatch, type FC, type SetStateAction } from 'react';

import type { UploadAction } from './DataUploadForm';
import type { ColumnMapping } from './FileUpload/ColumnMapping';
import { SequenceEntryUpload } from './FileUpload/SequenceEntryUploadComponent';
import type { ProcessedFile } from './FileUpload/fileProcessing';
import type { InputField, SubmissionDataTypes } from '../../types/config';
import { getFirstLightweightSchema, type ReferenceGenomesLightweightSchema } from '../../types/referencesGenomes';
import { EditableSequences } from '../Edit/EditableSequences.ts';
import { EditableMetadata, MetadataForm } from '../Edit/MetadataForm';
import { SequencesForm } from '../Edit/SequencesForm';

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
    organism: string;
    action: UploadAction;
    referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema;
    metadataTemplateFields: Map<string, InputField[]>;
    submissionDataTypes: SubmissionDataTypes;
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
    organism,
    action,
    referenceGenomeLightweightSchema,
    metadataTemplateFields,
    submissionDataTypes,
}) => {
    const enableConsensusSequences = submissionDataTypes.consensusSequences;
    const isMultiSegmented =
        getFirstLightweightSchema(referenceGenomeLightweightSchema).nucleotideSegmentNames.length > 1;
    const [editableMetadata, setEditableMetadata] = useState(EditableMetadata.empty());
    const [editableSequences, setEditableSequences] = useState(
        EditableSequences.fromSequenceNames(referenceGenomeLightweightSchema),
    );

    const [metadataFile, setMetadataFile] = useState<ProcessedFile | undefined>(undefined);
    const [sequenceFile, setSequenceFile] = useState<ProcessedFile | undefined>(undefined);
    // The columnMapping can be null; if null -> don't apply mapping.
    const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);

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
                        const metadataFile = editableMetadata.getMetadataTsv();
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
                            submissionId,
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
                        if (enableConsensusSequences && sFile === undefined) {
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
                referenceGenomeLightweightSchema={referenceGenomeLightweightSchema}
                metadataTemplateFields={metadataTemplateFields}
                enableConsensusSequences={enableConsensusSequences}
                isMultiSegmented={isMultiSegmented}
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
