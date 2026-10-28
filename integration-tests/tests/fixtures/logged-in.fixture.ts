import { test as base } from './console-warnings.fixture';
import { loginTestUserWithCookies } from '../utils/dataAuthentication';

/**
 * Like the plain test, but `page` is logged in as the test account. Use it for specs that browse released data,
 * which requires a login when the instance sets `auth.requireAuthenticationForData`.
 */
export const test = base.extend({
    page: async ({ page }, use) => {
        await loginTestUserWithCookies(page);
        await use(page);
    },
});
