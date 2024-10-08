import type { APIRoute } from 'astro';

import { cleanOrganism } from '../../../../components/Navigation/cleanOrganism';
import type { UploadAction } from '../../../../components/Submission/DataUploadForm.tsx';
import { getSchema } from '../../../../config';
import { ACCESSION_FIELD, SUBMISSION_ID_FIELD } from '../../../../settings.ts';

export const GET: APIRoute = async ({ params, request }) => {
    const rawOrganism = params.organism!;
    const { organism } = cleanOrganism(rawOrganism);
    if (organism === undefined) {
        return new Response(undefined, {
            status: 404,
        });
    }

    const action: UploadAction = new URL(request.url).searchParams.get('format') === 'revise' ? 'revise' : 'submit';
    const extraFields = action === 'submit' ? [SUBMISSION_ID_FIELD] : [ACCESSION_FIELD, SUBMISSION_ID_FIELD];

    const { inputFields } = getSchema(organism.key);

    const headers: Record<string, string> = {
        'Content-Type': 'text/tsv',
    };

    const filename = `${organism.displayName.replaceAll(' ', '_')}_metadata_${action === 'revise' ? 'revision_' : ''}template.tsv`;
    headers['Content-Disposition'] = `attachment; filename="${filename}"`;

    const fieldNames = inputFields.map((field) => field.name);
    const tsvTemplate = [...extraFields, ...fieldNames].join('\t') + '\n';

    return new Response(tsvTemplate, {
        headers,
    });
};
