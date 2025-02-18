import { useState, type Dispatch, type SetStateAction } from "react";
import type { ProcessingAnnotationSourceType, SequenceEntryToEdit } from "../../types/backend";
import type { Row } from "./InputField";


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
    