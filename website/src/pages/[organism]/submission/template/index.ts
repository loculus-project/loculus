import type { APIRoute } from 'astro';
import { err, type Result } from 'neverthrow';
import { getSchema } from '../../../../config';
import { cleanOrganism } from '../../../../components/Navigation/cleanOrganism';

export const GET: APIRoute = async ({ params, redirect, request }) => {
    const rawOrganism = params.organism!;
    const {organism} = cleanOrganism(rawOrganism)
    if(organism === undefined){
        return new Response(undefined, {
            status: 404,
        });
    }
    
    const {inputFields} = getSchema(organism.key)


    const headers: Record<string, string> = {
        'Content-Type': 'text/tsv', //TODO - check this
    };
    
        const filename = `${organism.displayName.replaceAll(" ","_")}_metadata_template.tsv`;
        headers['Content-Disposition'] = `attachment; filename="${filename}"`;

        const tsvTemplate = inputFields.map(field => field.name).join("\t")+"\n"
    

    return new Response(tsvTemplate, {
        headers,
    });
};
