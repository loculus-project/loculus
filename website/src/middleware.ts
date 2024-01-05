import { sequence } from 'astro:middleware';

import { authMiddleware } from './middleware/authMiddleware.ts';
import { organismValidatorMiddleware } from './middleware/organismValidatorMiddleware.ts';

export const onRequest = sequence(organismValidatorMiddleware, authMiddleware);
