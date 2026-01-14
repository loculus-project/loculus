export function createAuthorizationHeader(token?: string) {
    return token ? { Authorization: `Bearer ${token}` } : undefined; // eslint-disable-line @typescript-eslint/naming-convention
}
