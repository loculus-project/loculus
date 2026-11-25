import { sequence } from 'astro:middleware';

import { safeGetWebsiteConfig } from './config.ts';
import { accessLogMiddleware } from './middleware/accessLogMiddleware.ts';
import { authMiddleware } from './middleware/authMiddleware.ts';
import { catchErrorMiddleware } from './middleware/catchErrorMiddleware.ts';
import { organismValidatorMiddleware } from './middleware/organismValidatorMiddleware.ts';
import { submissionPagesDisablingMiddleware } from './middleware/submissionPagesDisablingMiddleware.ts';
import { installOutgoingRequestLogging } from './utils/outgoingRequestLogger.ts';

installOutgoingRequestLogging();

const websiteConfig = safeGetWebsiteConfig();
const middlewares = [accessLogMiddleware, catchErrorMiddleware, organismValidatorMiddleware, authMiddleware];
if (!(websiteConfig?.enableSubmissionPages ?? false) || (websiteConfig?.readOnlyMode ?? false)) {
    middlewares.push(submissionPagesDisablingMiddleware);
}

// Astro middleware
export const onRequest = sequence(...middlewares);
