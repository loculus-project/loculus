export function getAccessToken(session: Session | undefined): string | undefined {
    return session?.token?.accessToken;
}

/**
 * The token of an `Authorization: Bearer` header, e.g. sent by API clients that cannot use the session cookie.
 * The token is not validated here; LAPIS and the backend do that.
 */
export function getBearerToken(request: Request): string | undefined {
    return /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
}

/**
 * For routes that proxy requests to other services: prefers a Bearer token sent by the caller over the token of the
 * session.
 */
export function getForwardedAccessToken(request: Request, session: Session | undefined): string | undefined {
    return getBearerToken(request) ?? getAccessToken(session);
}
