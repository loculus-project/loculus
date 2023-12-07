export function getAccessToken(session: Session) {
    return session.token?.accessToken;
}
