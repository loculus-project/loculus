import { sequence } from 'astro:middleware';

import { authMiddleware } from './middleware/authMiddleware.ts';
import { catchErrorMiddleware } from './middleware/catchErrorMiddleware.ts';
import { organismValidatorMiddleware } from './middleware/organismValidatorMiddleware.ts';

// Astro middleware
export const onRequest = sequence(catchErrorMiddleware, organismValidatorMiddleware, authMiddleware);
