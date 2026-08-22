import type { APIRoute } from 'astro';

// Successful callbacks are consumed by authMiddleware before this route runs.
// Reaching the handler means the callback was missing, expired, or invalid.
export const GET: APIRoute = () => {
    return new Response('Authentication callback could not be validated.', { status: 400 });
};
