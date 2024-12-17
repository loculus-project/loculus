import type { APIRoute } from 'astro';

import { cleanOrganism } from '../../../../components/Navigation/cleanOrganism';
import type { UploadAction } from '../../../../components/Submission/DataUploadForm.tsx';
import { getMetadataTemplateFields } from '../../../../config';
import { ACCESSION_FIELD, SUBMISSION_ID_FIELD } from '../../../../settings.ts';

/** The TSV template file that users can download from the submission page. */
export const GET: APIRoute = ({ params, request }) => {
    const rawOrganism = params.organism!;
    const { organism } = cleanOrganism(rawOrganism);
    if (organism === undefined) {
        return new Response(undefined, {
            status: 404,
        });
    }

    const action: UploadAction = new URL(request.url).searchParams.get('format') === 'revise' ? 'revise' : 'submit';
    const extraFields = action === 'submit' ? [SUBMISSION_ID_FIELD] : [ACCESSION_FIELD, SUBMISSION_ID_FIELD];

    const headers: Record<string, string> = {
        'Content-Type': 'text/tsv', // eslint-disable-line @typescript-eslint/naming-convention
    };

    const filename = `${organism.displayName.replaceAll(' ', '_')}_metadata_${action === 'revise' ? 'revision_' : ''}template.tsv`;
    headers['Content-Disposition'] = `attachment; filename="${filename}"`;

    const fieldNames = getMetadataTemplateFields(organism.key);
    const tsvTemplate = [...extraFields, ...fieldNames].join('\t') + '\n';

    return new Response(tsvTemplate, {
        headers,
    });
};
