import { sequence } from 'astro:middleware';

import { safeGetWebsiteConfig } from './config.ts';
import { authMiddleware } from './middleware/authMiddleware.ts';
import { catchErrorMiddleware } from './middleware/catchErrorMiddleware.ts';
import { organismValidatorMiddleware } from './middleware/organismValidatorMiddleware.ts';
import { submissionPagesDisablingMiddleware } from './middleware/submissionPagesDisablingMiddleware.ts';

const middlewares = [catchErrorMiddleware, organismValidatorMiddleware, authMiddleware];
if (!(safeGetWebsiteConfig()?.enableSubmissionPages ?? false)) {
    middlewares.push(submissionPagesDisablingMiddleware);
}

// Astro middleware
export const onRequest = sequence(...middlewares);
