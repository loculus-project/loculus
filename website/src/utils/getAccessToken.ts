export function getAccessToken(session: Session | undefined): string | undefined {
    return session?.token?.accessToken;
}

/**
 * For routes that proxy requests to other services: prefers a Bearer token sent by the caller (e.g. API clients
 * that cannot use the session cookie) over the token of the session.
 */
export function getForwardedAccessToken(request: Request, session: Session | undefined): string | undefined {
    const bearerToken = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
    return bearerToken ?? getAccessToken(session);
}
