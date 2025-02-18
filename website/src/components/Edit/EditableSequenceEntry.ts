import { useState, type Dispatch, type SetStateAction } from 'react';

import type { Row } from './InputField';
import { ACCESSION_FIELD, SUBMISSION_ID_FIELD } from '../../settings';
import type { ProcessingAnnotationSourceType, SequenceEntryToEdit } from '../../types/backend';

export interface ProcessedInsertions {
    nucleotideInsertions: Record<string, string[]>;
    aminoAcidInsertions: Record<string, string[]>;
}

export class EditableSequenceEntry {
    public readonly editedMetadata: Row[];
    public readonly setEditedMetadata: Dispatch<SetStateAction<Row[]>>;
    public readonly editedSequences: Row[];
    public readonly setEditedSequences: Dispatch<SetStateAction<Row[]>>;
    public readonly processedInsertions: ProcessedInsertions;

    constructor(initialData: SequenceEntryToEdit) {
        const [_editedMetadata, _setEditedMetadata] = useState(mapMetadataToRow(initialData));
        this.editedMetadata = _editedMetadata;
        this.setEditedMetadata = _setEditedMetadata;
        const [_editedSequences, _setEditedSequences] = useState(mapSequencesToRow(initialData));
        this.editedSequences = _editedSequences;
        this.setEditedSequences = _setEditedSequences;
        this.processedInsertions = {
            nucleotideInsertions: initialData.processedData.nucleotideInsertions,
            aminoAcidInsertions: initialData.processedData.aminoAcidInsertions,
        };
    }

    public getMetadataTsv(submissionId: string, accession: string): File {
        const tableVals = [
            ...this.editedMetadata,
            { key: SUBMISSION_ID_FIELD, value: submissionId },
            { key: ACCESSION_FIELD, value: accession },
        ];

        const header = tableVals.map((row) => row.key).join('\t');

        const values = tableVals.map((row) => row.value).join('\t');

        const tsvContent = `${header}\n${values}`;

        return new File([tsvContent], 'metadata.tsv', { type: 'text/tab-separated-values' });
    }

    public getMetadataRecord(): Record<string, string> {
        return this.editedMetadata.reduce((prev, row) => ({ ...prev, [row.key]: row.value }), {});
    }

    public getSequenceFasta(submissionId: string) {
        const sequences = this.editedSequences;
        const fastaContent =
            sequences.length === 1
                ? `>${submissionId}\n${sequences[0].value}`
                : sequences.map((sequence) => `>${submissionId}_${sequence.key}\n${sequence.value}`).join('\n');

        return new File([fastaContent], 'sequences.fasta', { type: 'text/plain' });
    }

    public getSequenceRecord(): Record<string, string> {
        return this.editedSequences.reduce((prev, row) => ({ ...prev, [row.key]: row.value }), {});
    }
}

const mapMetadataToRow = (editedData: SequenceEntryToEdit): Row[] =>
    Object.entries(editedData.originalData.metadata).map(([key, value]) => ({
        key,
        value,
        initialValue: value,
        ...mapErrorsAndWarnings(editedData, key, 'Metadata'),
    }));

const mapSequencesToRow = (editedData: SequenceEntryToEdit): Row[] =>
    Object.entries(editedData.originalData.unalignedNucleotideSequences).map(([key, value]) => ({
        key,
        initialValue: value.toString(),
        value: value.toString(),
        ...mapErrorsAndWarnings(editedData, key, 'NucleotideSequence'),
    }));

const mapErrorsAndWarnings = (
    editedData: SequenceEntryToEdit,
    key: string,
    type: ProcessingAnnotationSourceType,
): { errors: string[]; warnings: string[] } => ({
    errors: (editedData.errors ?? [])
        .filter(
            (error) => error.processedFields.find((field) => field.name === key && field.type === type) !== undefined,
        )
        .map((error) => error.message),
    warnings: (editedData.warnings ?? [])
        .filter(
            (warning) =>
                warning.processedFields.find((field) => field.name === key && field.type === type) !== undefined,
        )
        .map((warning) => warning.message),
});
