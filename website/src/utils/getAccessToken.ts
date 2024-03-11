export function getAccessToken(session: Session | undefined): string | undefined {
    return session?.token?.accessToken;
}
