import type { APIRoute } from 'astro';

import { cleanOrganism } from '../../../components/Navigation/cleanOrganism.ts';
import { getSchema, getSubmissionIdInputFields, isMultiSegmentedOrganism } from '../../../config.ts';
import type { InputField } from '../../../types/config.ts';

function createRowFromField(field: InputField): string {
    return `${field.name}\t${field.required ?? ''}\t${field.definition ?? ''} ${field.guidance ?? ''}\t${field.example ?? ''}`;
}

export const GET: APIRoute = ({ params }) => {
    const rawOrganism = params.organism!;
    const { organism } = cleanOrganism(rawOrganism);
    if (organism === undefined) {
        return new Response(undefined, {
            status: 404,
        });
    }

    const extraFields = getSubmissionIdInputFields(isMultiSegmentedOrganism(organism.key)).map((field) =>
        createRowFromField(field),
    );

    const tableHeader = 'Field Name\tRequired\tDefinition\tGuidance\tExample';

    const { inputFields } = getSchema(organism.key);

    const headers: Record<string, string> = {
        'Content-Type': 'text/tsv', // eslint-disable-line @typescript-eslint/naming-convention
    };

    const filename = `${organism.displayName.replaceAll(' ', '_')}_metadata_overview.tsv`;
    headers['Content-Disposition'] = `attachment; filename="${filename}"`;

    const fieldNames = inputFields.map((field) => createRowFromField(field));
    const tsvTemplate = [tableHeader, ...extraFields, ...fieldNames].join('\n');

    return new Response(tsvTemplate, {
        headers,
    });
};
