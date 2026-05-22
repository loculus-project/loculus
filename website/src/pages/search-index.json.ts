import { searchIndexJson } from '../utils/buildSearchIndex';

export function GET() {
    return new Response(searchIndexJson, {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header name
        headers: { 'Content-Type': 'application/json' },
    });
}
