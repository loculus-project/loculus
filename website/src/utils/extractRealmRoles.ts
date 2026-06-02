import jsonwebtoken from 'jsonwebtoken';

// Decodes `realm_access.roles` from an already-verified Keycloak access token.
// Returns [] on any failure so a malformed token cannot escalate to admin.
export function extractRealmRoles(accessToken: string): string[] {
    try {
        const decoded = jsonwebtoken.decode(accessToken);
        if (decoded === null || typeof decoded === 'string') return [];
        const realm = (decoded as Record<string, unknown>).realm_access;
        if (realm === undefined || realm === null || typeof realm !== 'object') return [];
        const roles = (realm as Record<string, unknown>).roles;
        if (!Array.isArray(roles)) return [];
        return roles.filter((r): r is string => typeof r === 'string');
    } catch {
        return [];
    }
}
