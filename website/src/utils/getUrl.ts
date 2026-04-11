export function getUrl(origin: string, path?: string, params?: URLSearchParams, hash?: string) {
    const url = new URL(origin);
    if (path) url.pathname = path;
    if (params) url.search = params.toString();
    if (hash) url.hash = hash;
    return url.toString();
}
