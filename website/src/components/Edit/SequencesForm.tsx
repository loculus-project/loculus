import { type Dispatch, type FC, type SetStateAction } from 'react';

import { EditableSequences } from './EditableSequences.ts';
import { type SequenceEntryToEdit } from '../../types/backend.ts';
import { FileUploadComponent } from '../Submission/FileUpload/FileUploadComponent.tsx';
import { PLAIN_SEGMENT_KIND, VirtualFile } from '../Submission/FileUpload/fileProcessing.ts';

function generateAndDownloadFastaFile(
    accessionVersion: string,
    sequenceData: string,
    segmentKey?: string,
    isSingleSegment: boolean = false,
) {
    const fileName =
        isSingleSegment || !segmentKey ? `${accessionVersion}.fasta` : `${accessionVersion}_${segmentKey}.fasta`;

    const header = isSingleSegment || !segmentKey ? accessionVersion : `${accessionVersion}_${segmentKey}`;

    const fileContent = `>${header}\n${sequenceData}`;

    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();

    URL.revokeObjectURL(url);
}

type SequenceFormProps = {
    editableSequences: EditableSequences;
    setEditableSequences: Dispatch<SetStateAction<EditableSequences>>;
    dataToEdit?: SequenceEntryToEdit;
    isLoading?: boolean;
};
export const SequencesForm: FC<SequenceFormProps> = ({
    editableSequences,
    setEditableSequences,
    dataToEdit,
    isLoading,
}) => {
    const multiSegment = editableSequences.isMultiSegmented();
    return (
        <>
            <h3 className='subtitle'>{`Nucleotide sequence${multiSegment ? 's' : ''}`}</h3>
            <div className='flex flex-col lg:flex-row gap-6'>
                {editableSequences.rows.map((field) => (
                    <div className='space-y-2 w-56' key={field.key}>
                        {multiSegment && (
                            <label className='text-gray-900 font-medium text-sm block'>{field.label}</label>
                        )}
                        <FileUploadComponent
                            setFile={async (file) => {
                                const value = file ? await file.text() : null;
                                setEditableSequences((editableSequences) => editableSequences.update(field.key, value));
                            }}
                            name={`${field.label}_segment_file`}
                            ariaLabel={`${field.label} Segment File`}
                            fileKind={PLAIN_SEGMENT_KIND}
                            small={true}
                            initialValue={
                                field.value !== null ? new VirtualFile(field.value, 'Existing data') : undefined
                            }
                            showUndo={true}
                            onDownload={
                                field.value !== null && dataToEdit
                                    ? () => {
                                          if (field.value === null) {
                                              return;
                                          }
                                          const accessionVersion = `${dataToEdit.accession}.${dataToEdit.version}`;
                                          generateAndDownloadFastaFile(
                                              accessionVersion,
                                              field.value,
                                              field.label,
                                              multiSegment,
                                          );
                                      }
                                    : undefined
                            }
                            downloadDisabled={isLoading}
                        />
                    </div>
                ))}
            </div>
        </>
    );
};
