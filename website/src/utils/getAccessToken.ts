export function getAccessToken(session: Session) {
    return session.token?.access_token;
}
