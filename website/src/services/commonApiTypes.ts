import { makeErrors, makeParameters } from '@zodios/core';
import z from 'zod';

import { problemDetail } from '../types/backend.ts';

export const [authorizationHeader] = makeParameters([
    {
        name: 'Authorization',
        type: 'Header',
        schema: z.string().includes('Bearer ', { position: 0 }),
    },
]);

export const [optionalAuthorizationHeader] = makeParameters([
    {
        name: 'Authorization',
        type: 'Header',
        schema: z.string().includes('Bearer ', { position: 0 }).optional(),
    },
]);

export function withOrganismPathSegment<Path extends `/${string}`>(path: Path) {
    return `/:organism${path}` as const;
}

export const notAuthorizedError = makeErrors([
    {
        status: 401,
        schema: z.never(),
    },
])[0];

export const conflictError = { status: 409, schema: problemDetail };
