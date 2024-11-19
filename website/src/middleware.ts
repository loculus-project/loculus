import { sequence } from 'astro:middleware';

import { getWebsiteConfig } from './config.ts';
import { authMiddleware } from './middleware/authMiddleware.ts';
import { catchErrorMiddleware } from './middleware/catchErrorMiddleware.ts';
import { organismValidatorMiddleware } from './middleware/organismValidatorMiddleware.ts';
import { submissionPagesDisablingMiddleware } from './middleware/submissionPagesDisablingMiddleware.ts';

const middlewares = [catchErrorMiddleware, organismValidatorMiddleware, authMiddleware];
if (!getWebsiteConfig().enableSubmissionPages) {
    middlewares.push(submissionPagesDisablingMiddleware);
}

// Astro middleware
export const onRequest = sequence(...middlewares);
