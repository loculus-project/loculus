import { expect, test, describe } from 'vitest';

import { isSuperUser } from './isSuperUser';

// Helper function to create a JWT token with specified roles
function createJwtToken(roles: string[]): string {
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
        realm_access: { roles },
        preferred_username: 'testuser',
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    };
    
    // Create a mock JWT token (header.payload.signature)
    const headerEncoded = btoa(JSON.stringify(header));
    const payloadEncoded = btoa(JSON.stringify(payload));
    const signature = 'mock-signature';
    
    return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

describe('isSuperUser', () => {
    test('should return false when session is undefined', () => {
        expect(isSuperUser(undefined)).toBe(false);
    });

    test('should return false when user is not logged in', () => {
        const session = {
            isLoggedIn: false,
            token: {
                accessToken: createJwtToken(['super_user']),
                refreshToken: 'refresh-token',
            },
        };
        expect(isSuperUser(session)).toBe(false);
    });

    test('should return false when no token is available', () => {
        const session = {
            isLoggedIn: true,
        };
        expect(isSuperUser(session)).toBe(false);
    });

    test('should return false when access token is missing', () => {
        const session = {
            isLoggedIn: true,
            token: {
                refreshToken: 'refresh-token',
            } as any, // Cast to bypass TypeScript check since we're testing edge case
        };
        expect(isSuperUser(session)).toBe(false);
    });

    test('should return true when user has super_user role', () => {
        const session = {
            isLoggedIn: true,
            token: {
                accessToken: createJwtToken(['super_user']),
                refreshToken: 'refresh-token',
            },
        };
        expect(isSuperUser(session)).toBe(true);
    });

    test('should return false when user does not have super_user role', () => {
        const session = {
            isLoggedIn: true,
            token: {
                accessToken: createJwtToken(['regular_user']),
                refreshToken: 'refresh-token',
            },
        };
        expect(isSuperUser(session)).toBe(false);
    });

    test('should return true when user has super_user role among other roles', () => {
        const session = {
            isLoggedIn: true,
            token: {
                accessToken: createJwtToken(['regular_user', 'super_user', 'other_role']),
                refreshToken: 'refresh-token',
            },
        };
        expect(isSuperUser(session)).toBe(true);
    });

    test('should return false when user has empty roles array', () => {
        const session = {
            isLoggedIn: true,
            token: {
                accessToken: createJwtToken([]),
                refreshToken: 'refresh-token',
            },
        };
        expect(isSuperUser(session)).toBe(false);
    });

    test('should return false when token is invalid', () => {
        const session = {
            isLoggedIn: true,
            token: {
                accessToken: 'invalid-token',
                refreshToken: 'refresh-token',
            },
        };
        expect(isSuperUser(session)).toBe(false);
    });

    test('should return false when token payload is malformed', () => {
        const session = {
            isLoggedIn: true,
            token: {
                accessToken: 'header.invalid-base64.signature',
                refreshToken: 'refresh-token',
            },
        };
        expect(isSuperUser(session)).toBe(false);
    });
});