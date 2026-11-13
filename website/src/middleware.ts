import { defineMiddleware, sequence } from 'astro:middleware';

import { safeGetWebsiteConfig } from './config.ts';
import { authMiddleware } from './middleware/authMiddleware.ts';
import { catchErrorMiddleware } from './middleware/catchErrorMiddleware.ts';
import { organismValidatorMiddleware } from './middleware/organismValidatorMiddleware.ts';
import { submissionPagesDisablingMiddleware } from './middleware/submissionPagesDisablingMiddleware.ts';
import { routes } from './routes/routes.ts';

const websiteConfig = safeGetWebsiteConfig();
const middlewares = [catchErrorMiddleware, organismValidatorMiddleware, authMiddleware];
if (!(websiteConfig?.enableSubmissionPages ?? false) || (websiteConfig?.readOnlyMode ?? false)) {
    middlewares.push(submissionPagesDisablingMiddleware);
}

const middlewareChain = sequence(...middlewares);

// Astro middleware
export const onRequest = defineMiddleware((context, next) =>
    context.url.pathname === routes.health() ? next() : middlewareChain(context, next),
);
