import { useState, type FC } from 'react';

import type { UploadAction } from './DataUploadForm';
import type { ColumnMapping } from './FileUpload/ColumnMapping';
import { SequenceEntryUpload } from './FileUpload/SequenceEntryUploadComponent';
import type { ProcessedFile } from './FileUpload/fileProcessing';
import type { InputField } from '../../types/config';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes';
import { EditableSequenceEntry } from '../Edit/EditableSequenceEntry';
import { InputForm } from '../Edit/InputForm';

type InputMode = 'form' | 'fileUpload';

type SequenceData = {
    metadataFile?: File;
    sequenceFile?: File;
};

type FormOrUploadWrapperProps = {
    inputMode: InputMode;
    fileCreatorSetter: (fileCreator: () => SequenceData) => void;

    organism: string;
    action: UploadAction;
    referenceGenomeSequenceNames: ReferenceGenomesSequenceNames;
    metadataTemplateFields: Map<string, InputField[]>;
    enableConsensusSequences: boolean;
    isMultiSegmented: boolean;
};

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
    const editableSequenceEntry = new EditableSequenceEntry();
    const [metadataFile, setMetadataFile] = useState<ProcessedFile | undefined>(undefined);
    const [sequenceFile, setSequenceFile] = useState<ProcessedFile | undefined>(undefined);
    // The columnMapping can be null; if null -> don't apply mapping.
    const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);

    fileCreatorSetter(() => {
        switch (inputMode) {
            case 'form': {
                const interalSubmissionId = 'subId';
                return {
                    metadataFile: editableSequenceEntry.getMetadataTsv(interalSubmissionId),
                    sequenceFile: editableSequenceEntry.getSequenceFasta(interalSubmissionId),
                };
            }
            case 'fileUpload': {
                return {
                    metadataFile: metadataFile?.inner(),
                    sequenceFile: sequenceFile?.inner(),
                };
            }
        }
    });

    if (inputMode === 'fileUpload') {
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
