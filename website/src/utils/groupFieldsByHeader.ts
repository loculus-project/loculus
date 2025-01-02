import type { InputField, Metadata } from '../types/config';

const SUBMISSION_ID_FIELD: InputField = {
    name: 'submissionId',
    displayName: 'Submission ID',
    definition: 'FASTA ID',
    guidance:
        'Your sequence identifier; should match the FASTA file header - this is used to link the metadata to the FASTA sequence',
    example: 'GJP123',
    noEdit: true,
    required: true,
};

export const groupFieldsByHeader = (inputFields: InputField[], metadata: Metadata[]): Map<string, InputField[]> => {
    const groups = new Map<string, InputField[]>();

    const requiredFields = inputFields.filter((meta) => meta.required);
    const desiredFields = inputFields.filter((meta) => meta.desired);

    groups.set('Required fields', [...requiredFields, SUBMISSION_ID_FIELD]);
    groups.set('Desired fields', desiredFields);
    groups.set('Submission details', [SUBMISSION_ID_FIELD]);

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
