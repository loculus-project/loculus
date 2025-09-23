export function createAuthorizationHeader(token?: string): Record<string, string> {
    if (token !== undefined && token !== '') {
        return { Authorization: `Bearer ${token}` }; // eslint-disable-line @typescript-eslint/naming-convention
    }
    return {};
}
