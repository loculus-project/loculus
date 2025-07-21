import { describe, expect, it } from 'vitest';
import { getExtraTopNavigationItems } from './extraTopNavigationItems';
import { routes } from './routes';

describe('getExtraTopNavigationItems', () => {
    it('should return the admin link if the user is a superuser', () => {
        const items = getExtraTopNavigationItems(true);
        expect(items).toEqual([
            {
                text: 'Admin',
                path: routes.adminDashboard(),
            },
        ]);
    });

    it('should return an empty array if the user is not a superuser', () => {
        const items = getExtraTopNavigationItems(false);
        expect(items).toEqual([]);
    });
});
