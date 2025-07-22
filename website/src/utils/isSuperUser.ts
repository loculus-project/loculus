/**
 * JWT payload structure for Keycloak tokens
 */
interface JwtPayload {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    realm_access?: {
        roles?: string[];
    };
    // eslint-disable-next-line @typescript-eslint/naming-convention
    preferred_username?: string;
    exp?: number;
}

/**
 * Checks if the current user is a superuser by examining their JWT token claims.
 * Superusers have the 'super_user' role in their realm_access.roles claim.
 */
export function isSuperUser(session: Session | undefined): boolean {
    if (!session?.isLoggedIn || !session.token?.accessToken) {
        return false;
    }

    try {
        // Parse JWT token to extract claims
        // JWT tokens have the format: header.payload.signature
        // We only need the payload which contains the claims
        const tokenParts = session.token.accessToken.split('.');
        if (tokenParts.length !== 3) {
            return false;
        }

        // Decode the base64url-encoded payload
        const payloadString = atob(tokenParts[1].replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(payloadString) as JwtPayload;

        // Check if the user has the super_user role
        const realmAccess = payload.realm_access;
        if (!realmAccess || !Array.isArray(realmAccess.roles)) {
            return false;
        }

        return realmAccess.roles.includes('super_user');
    } catch (_error) {
        // If we can't parse the token, assume not a superuser
        return false;
    }
}
