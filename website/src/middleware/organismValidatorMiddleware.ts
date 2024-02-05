import { defineMiddleware } from 'astro/middleware';

import { cleanOrganism } from '../components/Navigation/cleanOrganism.ts';

export const organismValidatorMiddleware = defineMiddleware(async (context, next) => {
    const organism = context.params.organism;
    if (organism === undefined) {
        return next();
    }

    const { organism: validatedOrganism } = cleanOrganism(organism);
    if (validatedOrganism === undefined) {
        return new Response(undefined, { status: 404 });
    }

    return next();
});
