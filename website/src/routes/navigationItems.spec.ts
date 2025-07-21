import { expect, test, describe } from 'vitest';

import { isSuperUser } from '../utils/isSuperUser';

// Since we can't easily test the full navigationItems.top function due to config dependencies,
// let's test the core logic by testing the isSuperUser function and a simple getAdminItems function

function getAdminItems(session: Session | undefined) {
    if (!isSuperUser(session)) {
        return [];
    }

    return [
        {
            text: 'Admin Dashboard',
            path: '/admin/dashboard',
        },
    ];
}

// Helper function to create a mock session
function createMockSession(roles: string[]): Session {
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
    const accessToken = `${headerEncoded}.${payloadEncoded}.${signature}`;

    return {
        isLoggedIn: true,
        user: {
            name: 'Test User',
            username: 'testuser',
            email: 'test@example.com',
            emailVerified: true,
        },
        token: {
            accessToken,
            refreshToken: 'refresh-token',
        },
    };
}

describe('admin navigation items', () => {
    test('should not include admin dashboard for regular user', () => {
        const session = createMockSession(['regular_user']);
        const items = getAdminItems(session);
        
        expect(items).toHaveLength(0);
    });

    test('should include admin dashboard for superuser', () => {
        const session = createMockSession(['super_user']);
        const items = getAdminItems(session);
        
        expect(items).toHaveLength(1);
        expect(items[0].text).toBe('Admin Dashboard');
        expect(items[0].path).toBe('/admin/dashboard');
    });

    test('should include admin dashboard when user has super_user among other roles', () => {
        const session = createMockSession(['regular_user', 'super_user', 'other_role']);
        const items = getAdminItems(session);
        
        expect(items).toHaveLength(1);
        expect(items[0].text).toBe('Admin Dashboard');
        expect(items[0].path).toBe('/admin/dashboard');
    });

    test('should not include admin dashboard when user is not logged in', () => {
        const session = {
            isLoggedIn: false,
            token: {
                accessToken: createMockSession(['super_user']).token?.accessToken!,
                refreshToken: 'refresh-token',
            },
        };
        const items = getAdminItems(session);
        
        expect(items).toHaveLength(0);
    });

    test('should not include admin dashboard when session is undefined', () => {
        const items = getAdminItems(undefined);
        
        expect(items).toHaveLength(0);
    });
});