import { describe, expect, test } from 'vitest';

import { isPublicRoute } from './isPublicRoute';
import { testOrganism } from '../components/vitest.setup.ts';

const otherOrganism = 'otherOrganism';
const configuredOrganisms = [testOrganism, otherOrganism];

describe('isPublicRoute', () => {
    test('should return false if not specified', () => {
        expect(isPublicRoute('/someRoute', [])).toBe(false);
    });

    test('should return true for empty string', () => {
        expect(isPublicRoute('', [])).toBe(true);
    });

    test('should return true if specified as public route', () => {
        expectToBePublic(`/${testOrganism}/search`);
        expectToBePublic('/');
        expectToBePublic(`/${testOrganism}`);
        expectToBePublic(`/${testOrganism}/sequences/id_002156`);
        expectToBePublic(`/${testOrganism}/sequences/id_002156`);
        expectToBePublic(`/${otherOrganism}/sequences/id_002156`);
    });

    test('should return false on non public routes', () => {
        expect(isPublicRoute('/user', configuredOrganisms)).toBe(false);
        expect(isPublicRoute('/user/someUsername', configuredOrganisms)).toBe(false);
        expect(isPublicRoute(`/${testOrganism}/revise`, configuredOrganisms)).toBe(false);
        expect(isPublicRoute(`/${testOrganism}/submit`, configuredOrganisms)).toBe(false);
    });

    function expectToBePublic(path: string) {
        expect(isPublicRoute(path, configuredOrganisms), path).toBe(true);
    }
});
