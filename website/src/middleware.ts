import { sequence } from 'astro:middleware';

import { adminRoleMiddleware } from './middleware/adminRoleMiddleware.ts';
import { authMiddleware } from './middleware/authMiddleware.ts';
import { catchErrorMiddleware } from './middleware/catchErrorMiddleware.ts';
import { configMiddleware } from './middleware/configMiddleware.ts';
import { organismValidatorMiddleware } from './middleware/organismValidatorMiddleware.ts';
import { submissionPagesDisablingMiddleware } from './middleware/submissionPagesDisablingMiddleware.ts';

export const onRequest = sequence(
    catchErrorMiddleware,
    configMiddleware,
    organismValidatorMiddleware,
    authMiddleware,
    adminRoleMiddleware,
    submissionPagesDisablingMiddleware,
);
