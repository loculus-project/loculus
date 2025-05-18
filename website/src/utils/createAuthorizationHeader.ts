export function createAuthorizationHeader(token: string) {
    return { Authorization: `Bearer ${token}` }; // eslint-disable-line @typescript-eslint/naming-convention
}
