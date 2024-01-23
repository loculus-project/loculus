import { defineMiddleware } from 'astro/middleware';

import { cleanOrganism } from '../components/Navigation/cleanOrganism.ts';
import { routes } from '../routes.ts';

export const organismValidatorMiddleware = defineMiddleware(async (context, next) => {
    const organism = context.params.organism;
    if (organism === undefined) {
        return next();
    }

    const { organism: validatedOrganism } = cleanOrganism(organism);
    if (validatedOrganism === undefined) {
        return context.redirect(routes.notFoundPage());
    }

    return next();
});
