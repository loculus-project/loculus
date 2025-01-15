import { ACCESSION_FIELD, SUBMISSION_ID_FIELD } from '../settings';
import type { InputField, Metadata } from '../types/config';

const SUBMISSION_ID_INPUT_FIELD: InputField = {
    name: SUBMISSION_ID_FIELD,
    displayName: 'Submission ID',
    definition: 'FASTA ID',
    guidance:
        'Your sequence identifier; should match the FASTA file header - this is used to link the metadata to the FASTA sequence',
    example: 'GJP123',
    noEdit: true,
    required: true,
};

const ACCESSION_INPUT_FIELD: InputField = {
    name: ACCESSION_FIELD,
    displayName: 'Accession',
    definition: 'The {name, e.g. Loculus} accession (without version) of the sequence you would like to revise',
    guidance: ''
    example: '{accessionPrefix, e.g. LOC_}000P97Y`
    guidance: 'TODO',
    example: 'TODO',
    noEdit: true,
    required: true,
};

/**
 * Returns InputFields grouped by headers. Also adds Submission and Accession fields, if appropriate.
 * The same field can occur under multiple headers.
 */
export const groupFieldsByHeader = (
    inputFields: InputField[],
    metadata: Metadata[],
    action: 'submit' | 'revise' = 'submit',
): Map<string, InputField[]> => {
    const groups = new Map<string, InputField[]>();

    const requiredFields = inputFields.filter((meta) => meta.required);
    const desiredFields = inputFields.filter((meta) => meta.desired);

    const coreFields =
        action === 'submit' ? [SUBMISSION_ID_INPUT_FIELD] : [SUBMISSION_ID_INPUT_FIELD, ACCESSION_INPUT_FIELD];

    groups.set('Required fields', [...coreFields, ...requiredFields]);
    groups.set('Desired fields', desiredFields);
    groups.set('Submission details', [SUBMISSION_ID_INPUT_FIELD]);

    inputFields.forEach((field) => {
        const metadataEntry = metadata.find((meta) => meta.name === field.name);
        const header = metadataEntry?.header ?? 'Uncategorized';

        if (!groups.has(header)) {
            groups.set(header, []);
        }
        groups.get(header)!.push({
            ...field,
        });
    });

    return groups;
};
