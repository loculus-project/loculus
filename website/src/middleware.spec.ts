import { describe, expect, test } from 'vitest';

import { isPublicRoute } from './middleware.ts';

describe('isPublicRoute', () => {
    test('should return false if not specified', () => {
        expect(isPublicRoute('/someRoute')).toBe(false);
    });

    test('should return false for empty string', () => {
        expect(isPublicRoute('')).toBe(true);
    });

    test('should return true if specified as public route', () => {
        expect(isPublicRoute('/search')).toBe(true);
        expect(isPublicRoute('/')).toBe(true);
        expect(isPublicRoute('/sequences/id_002156')).toBe(true);
    });

    test('should return false on non public routes', () => {
        expect(isPublicRoute('/user')).toBe(false);
        expect(isPublicRoute('/user/someUsername')).toBe(false);
        expect(isPublicRoute('/revise')).toBe(false);
        expect(isPublicRoute('/submit')).toBe(false);
    });
});
