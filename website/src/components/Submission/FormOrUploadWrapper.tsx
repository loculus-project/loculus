import { useState, type FC } from 'react';

import type { UploadAction } from './DataUploadForm';
import type { ColumnMapping } from './FileUpload/ColumnMapping';
import { SequenceEntryUpload } from './FileUpload/SequenceEntryUploadComponent';
import type { ProcessedFile } from './FileUpload/fileProcessing';
import type { InputField } from '../../types/config';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes';
import { EditableSequenceEntry } from '../Edit/EditableSequenceEntry';
import { InputForm } from '../Edit/InputForm';

export type InputMode = 'form' | 'bulk';

export type SequenceData = {
    metadataFile?: File;
    sequenceFile?: File;
};

type FormOrUploadWrapperProps = {
    inputMode: InputMode;
    fileCreatorSetter: (fileCreator: () => Promise<SequenceData>) => void;

    organism: string;
    action: UploadAction;
    referenceGenomeSequenceNames: ReferenceGenomesSequenceNames;
    metadataTemplateFields: Map<string, InputField[]>;
    enableConsensusSequences: boolean;
    isMultiSegmented: boolean;
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
    fileCreatorSetter,
    organism,
    action,
    referenceGenomeSequenceNames,
    metadataTemplateFields,
    enableConsensusSequences,
    isMultiSegmented,
}) => {
    const editableSequenceEntry = new EditableSequenceEntry(
        undefined,
        referenceGenomeSequenceNames.nucleotideSequences,
    );
    const [metadataFile, setMetadataFile] = useState<ProcessedFile | undefined>(undefined);
    const [sequenceFile, setSequenceFile] = useState<ProcessedFile | undefined>(undefined);
    // The columnMapping can be null; if null -> don't apply mapping.
    const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);

    fileCreatorSetter(async () => {
        switch (inputMode) {
            case 'form': {
                const interalSubmissionId = 'subId';
                return {
                    metadataFile: editableSequenceEntry.getMetadataTsv(interalSubmissionId),
                    sequenceFile: editableSequenceEntry.getSequenceFasta(interalSubmissionId),
                };
            }
            case 'bulk': {
                let mFile = metadataFile?.inner();
                if (metadataFile !== undefined && columnMapping !== null) {
                    mFile = await columnMapping.applyTo(metadataFile);
                }

                return {
                    metadataFile: mFile,
                    sequenceFile: sequenceFile?.inner(),
                };
            }
        }
    });

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
            <InputForm
                editableSequenceEntry={editableSequenceEntry}
                groupedInputFields={metadataTemplateFields}
                enableConsensusSequences={enableConsensusSequences}
            />
        );
    }
};
