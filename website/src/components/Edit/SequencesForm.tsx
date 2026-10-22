import { type Dispatch, type FC, type SetStateAction } from 'react';

import { EditableSequences } from './EditableSequences.ts';
import { type SequenceEntryToEdit } from '../../types/backend.ts';
import { FileUploadComponent } from '../Submission/FileUpload/FileUploadComponent.tsx';
import { PLAIN_SEGMENT_KIND, VirtualPlainSegmentFile } from '../Submission/FileUpload/fileProcessing.ts';

function generateAndDownloadFastaFile(fastaHeader: string, sequenceData: string) {
    const trimmedHeader = fastaHeader.replace(/\s+/g, '');
    const fileContent = `>${trimmedHeader}\n${sequenceData}`;

    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${trimmedHeader}.fasta`;
    a.click();

    URL.revokeObjectURL(url);
}

const removeExtension = (filename: string) => filename.replace(/\.[^/.]+$/, '');

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
                                if (file !== undefined) {
                                    const value = await file.text();
                                    const fastaHeader = file.fastaHeader() ?? removeExtension(file.handle().name);
                                    const updatedSequences = editableSequences.update(field.key, value, fastaHeader);
                                    setEditableSequences(updatedSequences);
                                } else {
                                    setEditableSequences((editableSequences) => editableSequences.remove(field.key));
                                }
                            }}
                            name={`${field.label}_segment_file`}
                            ariaLabel={`${field.label} Segment File`}
                            fileKind={PLAIN_SEGMENT_KIND}
                            small={true}
                            initialValue={
                                field.initialValue !== null
                                    ? new VirtualPlainSegmentFile(
                                          field.initialValue,
                                          'Existing data',
                                          field.initialFastaHeader,
                                      )
                                    : undefined
                            }
                            showUndo={field.initialValue !== null}
                            onDownload={
                                dataToEdit && field.value !== null
                                    ? () => generateAndDownloadFastaFile(field.fastaHeader, field.value)
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
