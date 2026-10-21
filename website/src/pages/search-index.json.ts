import { searchIndexETag, searchIndexJson } from '../utils/buildSearchIndex';

/* eslint-disable @typescript-eslint/naming-convention -- HTTP header names */
export function GET({ request }: { request: Request }) {
    if (request.headers.get('if-none-match') === searchIndexETag) {
        return new Response(null, {
            status: 304,
            headers: {
                'ETag': searchIndexETag,
                'Cache-Control': 'public, max-age=3600',
            },
        });
    }

    return new Response(searchIndexJson, {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
            'ETag': searchIndexETag,
        },
    });
}
/* eslint-enable @typescript-eslint/naming-convention */
