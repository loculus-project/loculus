// The website's canonical file links: /seq/<accessionVersion>/<fileCategory>/<fileName>
const websiteFileLinkPath = /^\/seq\/[^/]+\/[^/]+\/[^/]+$/;

/**
 * Turns a canonical file link of this website into a path on the current origin. The backend builds these links
 * from the configured website URL, which can differ from the host the user is browsing (e.g. an IP address instead
 * of the hostname). The browser would then send no session cookie and the file route would answer with 401 when the
 * instance sets `auth.requireAuthenticationForData`. Other URLs (backend or S3 links) are returned unchanged.
 */
export function toSameOriginFileUrl(url: string): string {
    try {
        const { pathname, search } = new URL(url);
        return websiteFileLinkPath.test(pathname) ? pathname + search : url;
    } catch {
        return url;
    }
}
