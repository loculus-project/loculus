import type { APIRoute } from 'astro';

import { cleanOrganism } from '../../../../components/Navigation/cleanOrganism';
import { getSchema } from '../../../../config';

export const GET: APIRoute = async ({ params }) => {
    const rawOrganism = params.organism!;
    const { organism } = cleanOrganism(rawOrganism);
    if (organism === undefined) {
        return new Response(undefined, {
            status: 404,
        });
    }

    const { inputFields } = getSchema(organism.key);

    const headers: Record<string, string> = {
        'Content-Type': 'text/tsv',
    };

    const filename = `${organism.displayName.replaceAll(' ', '_')}_metadata_template.tsv`;
    headers['Content-Disposition'] = `attachment; filename="${filename}"`;

    const tsvTemplate = inputFields.map((field) => field.name).join('\t') + '\n';

    return new Response(tsvTemplate, {
        headers,
    });
};
