import { sequence } from 'astro:middleware';

import { authMiddleware } from './middleware/authMiddleware.ts';
import { catchErrorMiddleware } from './middleware/catchErrorMiddleware.ts';
import { organismValidatorMiddleware } from './middleware/organismValidatorMiddleware.ts';
import { submissionPagesDisablingMiddleware } from './middleware/submissionPagesDisablingMiddleware.ts';

const middlewares = [catchErrorMiddleware, organismValidatorMiddleware, authMiddleware];


// Astro middleware
export const onRequest = sequence(...middlewares);
