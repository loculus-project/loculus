import { type Dispatch, type FC, type SetStateAction } from 'react';

import { type SequenceEntryToEdit } from '../../types/backend.ts';
import type { ReferenceGenomesLightweightSchema } from '../../types/referencesGenomes.ts';
import { FileUploadComponent } from '../Submission/FileUpload/FileUploadComponent.tsx';
import { PLAIN_SEGMENT_KIND, VirtualFile } from '../Submission/FileUpload/fileProcessing.ts';

function generateAndDownloadFastaFile(fastaHeader: string | null, sequenceData: string | null) {
    let fileContent = '';
    let trimmedHeader = '';

    if (fastaHeader === null && sequenceData === null) {
        fileContent = '';
    } else {
        if (fastaHeader === null) {
            throw new Error(
                'Internal Error: sequenceData exists but fastaHeader is empty - contact your administrator',
            );
        }

        trimmedHeader = fastaHeader.replace(/\s+/g, '');
        fileContent = `>${trimmedHeader}\n${sequenceData ?? ''}`;
    }

    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${trimmedHeader || 'sequence'}.fasta`;
    a.click();

    URL.revokeObjectURL(url);
}

type EditableSequenceFile = {
    key: string;
    label: string;
    fastaHeader: string | null;
    value: string | null;
    initialValue: string | null;
};

export class EditableSequences {
    private static nextKey = 0;

    private readonly editableSequenceFiles: EditableSequenceFile[];
    private readonly maxNumberOfRows: number;

    public get rows(): Required<EditableSequenceFile>[] {
        const rows = this.editableSequenceFiles.map((row, _) => ({
            ...row,
            label: row.label,
        }));
        if (rows.length < this.maxNumberOfRows) {
            rows.push({
                label: `Add a segment`,
                fastaHeader: null,
                value: null,
                initialValue: null,
                key: EditableSequences.getNextKey(),
            });
        }
        return rows;
    }

    private constructor(rows: EditableSequenceFile[], maxNumberOfRows: number) {
        this.editableSequenceFiles = rows;
        this.maxNumberOfRows = maxNumberOfRows;
    }

    isMultiSegmented() {
        return this.maxNumberOfRows > 1;
    }

    /**
     * @param initialData The sequence entry to edit, from which the initial sequence data is taken.
     * @param referenceGenomeLightweightSchema
     */
    static fromInitialData(
        initialData: SequenceEntryToEdit,
        referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema,
    ): EditableSequences {
        const maxNumberRows = this.getMaxNumberOfRows(referenceGenomeLightweightSchema);
        const existingDataRows = Object.entries(initialData.originalData.unalignedNucleotideSequences).map(
            ([key, value]) => ({
                // TODO: for now key corresponds to the segment name in future it will be the fastaHeader
                label: key, // TODO: In future prepro will map the fastaHeader to the segment (will be added to the label)
                fastaHeader:
                    maxNumberRows > 1
                        ? `${initialData.submissionId}_${key.replace(/\s+/g, '')}`
                        : initialData.submissionId, // TODO: in future will come from the key
                value: value,
                initialValue: value,
                key: EditableSequences.getNextKey(),
            }),
        );
        return new EditableSequences(existingDataRows, maxNumberRows);
    }

    /**
     * Create an empty {@link EditableSequences} object from segment names.
     * Each segment will be empty initially.
     */
    static fromSequenceNames(referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema): EditableSequences {
        return new EditableSequences([], this.getMaxNumberOfRows(referenceGenomeLightweightSchema));
    }

    private static getMaxNumberOfRows(referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema): number {
        return Math.max(
            ...Object.values(referenceGenomeLightweightSchema).map(
                (suborganismSchema) => suborganismSchema.nucleotideSegmentNames.length,
            ),
        );
    }

    private static getNextKey(): string {
        return (EditableSequences.nextKey++).toString();
    }

    /**
     * Create a new {@link EditableSequences} object with the given row value updated.
     */
    update(key: string, value: string | null, label: string | null, fastaHeader: string | null): EditableSequences {
        const existingFileIndex = this.editableSequenceFiles.findIndex((file) => file.key === key);

        if (existingFileIndex === -1 && this.editableSequenceFiles.length === this.maxNumberOfRows) {
            throw new Error(`Maximum limit reached — you can add up to ${this.maxNumberOfRows} sequence file(s) only.`);
        }

        label ??= value == null ? 'Add a segment' : key;
        fastaHeader ??= value == null ? null : key; // Ensure fastaHeader is never null if a sequence exists
        const existingFastaHeaders = this.editableSequenceFiles.map((sequence) => sequence.fastaHeader);
        if (existingFastaHeaders.includes(fastaHeader)) {
            throw new Error(`A sequence with the fastaHeader ${fastaHeader} already exists.`);
        }

        const newSequenceFiles = [...this.editableSequenceFiles];
        newSequenceFiles[existingFileIndex > -1 ? existingFileIndex : this.editableSequenceFiles.length] = {
            ...(existingFileIndex > -1 ? newSequenceFiles[existingFileIndex] : { key, initialValue: null }),
            value: value,
            label: label,
            fastaHeader: fastaHeader,
        };

        return new EditableSequences(
            newSequenceFiles.filter((file) => file.value !== null),
            this.maxNumberOfRows,
        );
    }

    getSequenceFasta(): File | undefined {
        const filledRows = this.rows.filter((row) => row.value !== null);

        if (filledRows.length === 0) {
            return undefined;
        }

        const fastaContent = filledRows.map((sequence) => `>${sequence.fastaHeader}\n${sequence.value}`).join('\n');

        return new File([fastaContent], 'sequences.fasta', { type: 'text/plain' });
    }

    getSequenceRecord(): Record<string, string> {
        const filledRows = this.rows.filter(
            (
                row,
            ): row is Omit<EditableSequenceFile, 'fastaHeader' | 'value'> & { fastaHeader: string; value: string } =>
                row.value !== null && row.fastaHeader !== null,
        );

        return filledRows.reduce<Record<string, string>>((prev, row) => {
            prev[row.label] = row.value; //TODO: this will have to be changed to fastaHeader in future
            return prev;
        }, {});
    }
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
                                const text = file ? await file.text() : null;
                                const fastaHeader = file ? await file.header() : null;
                                setEditableSequences((editableSequences) =>
                                    editableSequences.update(field.key, text, fastaHeader, fastaHeader),
                                );
                            }}
                            name={`${field.label}_segment_file`}
                            ariaLabel={`${field.label} Segment File`}
                            fileKind={PLAIN_SEGMENT_KIND}
                            small={true}
                            initialValue={
                                field.initialValue !== null
                                    ? new VirtualFile(field.initialValue, 'Existing data')
                                    : undefined
                            }
                            showUndo={field.initialValue !== null}
                            onDownload={
                                field.initialValue !== null && dataToEdit
                                    ? () => {
                                          generateAndDownloadFastaFile(field.fastaHeader, field.value);
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
