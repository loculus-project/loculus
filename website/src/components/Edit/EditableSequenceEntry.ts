import { useState, type Dispatch, type SetStateAction } from 'react';

import type { Row } from './InputField';
import { ACCESSION_FIELD, SUBMISSION_ID_FIELD } from '../../settings';
import type { ProcessingAnnotationSourceType, SequenceEntryToEdit } from '../../types/backend';

export interface ProcessedInsertions {
    nucleotideInsertions: Record<string, string[]>;
    aminoAcidInsertions: Record<string, string[]>;
}

/**
 * A data class underlying the form input.
 * The sequence metadata and sequence data in this class can be retrieved as a Record<string, string>
 * or as Files (TSV, Fasta), depending on which API endpoint the data needs to be submitted to.
 */
export class EditableSequenceEntry {
    public readonly editedMetadata: Row[];
    public readonly setEditedMetadata: Dispatch<SetStateAction<Row[]>>;
    public readonly editedSequences: Row[];
    public readonly setEditedSequences: Dispatch<SetStateAction<Row[]>>;
    public readonly processedInsertions: ProcessedInsertions;

    /**
     * @param initialData If given, pre-populate the form with the information from this object. 'segmentNames' will be ignored.
     * @param segmentNames If no 'initialData' is given, use the segmentNames to pre-populate empty sequences with according keys.
     *     This is useful, because the form will render one input field for existing segment, so if no segments are there,
     *     there won't be any input fields.
     */
    constructor(initialData?: SequenceEntryToEdit, segmentNames?: string[]) {
        const [_editedMetadata, _setEditedMetadata] = useState(initialData ? mapMetadataToRow(initialData) : []);
        this.editedMetadata = _editedMetadata;
        this.setEditedMetadata = _setEditedMetadata;
        const initialEditedSequences = initialData
            ? mapSequencesToRow(initialData)
            : segmentNames
              ? emptyRowsFromSegmentNames(segmentNames)
              : [];
        const [_editedSequences, _setEditedSequences] = useState(initialEditedSequences);
        this.editedSequences = _editedSequences;
        this.setEditedSequences = _setEditedSequences;
        this.processedInsertions = initialData
            ? {
                  nucleotideInsertions: initialData.processedData.nucleotideInsertions,
                  aminoAcidInsertions: initialData.processedData.aminoAcidInsertions,
              }
            : {
                  nucleotideInsertions: {},
                  aminoAcidInsertions: {},
              };
    }

    /**
     * Return the Metadata information as a TSV. If no information is present, 'undefined' is returned.
     * @param submissionId The submission ID to put into the TSV.
     * @param accession optional. If an accession is already assigned to this sequence, it should be given.
     */
    public getMetadataTsv(submissionId: string, accession?: string): File | undefined {
        // if no values are set at all, return undefined
        if (!this.editedMetadata.some((row) => row.value !== '')) return undefined;

        const tableVals = [...this.editedMetadata, { key: SUBMISSION_ID_FIELD, value: submissionId }];

        if (accession) {
            tableVals.push({
                key: ACCESSION_FIELD,
                value: accession,
            });
        }

        // TODO - use a library for TSV building, because raw string interpolation doesn't escape stuff.

        const header = tableVals.map((row) => row.key).join('\t');

        const values = tableVals.map((row) => row.value).join('\t');

        const tsvContent = `${header}\n${values}`;

        return new File([tsvContent], 'metadata.tsv', { type: 'text/tab-separated-values' });
    }

    public getMetadataRecord(): Record<string, string> {
        return this.editedMetadata.reduce((prev, row) => ({ ...prev, [row.key]: row.value }), {});
    }

    public getSequenceFasta(submissionId: string): File | undefined {
        // if no values are set at all, return undefined
        if (!this.editedSequences.some((row) => row.value !== '')) return undefined;

        const sequences = this.editedSequences;
        const fastaContent =
            sequences.length === 1
                ? `>${submissionId}\n${sequences[0].value}`
                : sequences.map((sequence) => `>${submissionId}_${sequence.key}\n${sequence.value}`).join('\n');

        // TODO return undefined if sequence is empty.

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

const emptyRowsFromSegmentNames = (segmentNames: string[]): Row[] =>
    segmentNames.map((name) => ({
        key: name,
        initialValue: '',
        value: '',
        errors: [],
        warnings: [],
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
