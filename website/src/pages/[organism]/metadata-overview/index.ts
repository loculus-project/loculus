import type { APIRoute } from 'astro';

import { cleanOrganism } from '../../../components/Navigation/cleanOrganism.ts';
import { getSchema, getSubmissionIdInputFields } from '../../../config.ts';
import type { InputField } from '../../../types/config.ts';

function createRowFromField(field: InputField): string {
    return [
        field.name,
        field.required ? 'Yes' : 'No',
        field.definition ? `${field.definition} ${field.guidance ?? ''}`.trim() : '',
        field.example ?? '',
    ].join('\t');
}

export const GET: APIRoute = ({ params }) => {
    const rawOrganism = params.organism!;
    const { organism } = cleanOrganism(rawOrganism);
    if (organism === undefined) {
        return new Response(undefined, {
            status: 404,
        });
    }
    const schema = getSchema(organism.key);

    const tsvTemplate = [
        ['Field Name', 'Required', 'Definition', 'Example'].join('\t'),
        [...getSubmissionIdInputFields(schema), ...schema.inputFields].map((field) => createRowFromField(field)),
    ].join('\n');

    const filename = `${organism.displayName.replaceAll(' ', '_')}_metadata_overview.tsv`;

    return new Response(tsvTemplate, {
        headers: {
            'Content-Type': 'text/tsv', // eslint-disable-line @typescript-eslint/naming-convention
            'Content-Disposition': `attachment; filename="${filename}"`, // eslint-disable-line @typescript-eslint/naming-convention
        },
    });
};
