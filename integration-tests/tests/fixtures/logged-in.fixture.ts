import type { Page } from '@playwright/test';

import { test as base } from './console-warnings.fixture';
import { loginTestUserWithCookies } from '../utils/lapisAuth';

/**
 * Like the plain test, but every `page` comes with the `testuser` test account logged in
 * (httpOnly session cookies set directly, no UI login round trip).
 *
 * Use this fixture in specs that browse released data (homepage, search, sequence pages,
 * seqsets, group pages): when the deployment has LAPIS authentication enabled
 * (`lapis.auth.enabled`), those pages require a login. On deployments without LAPIS
 * authentication the login is skipped and the specs run anonymously as before.
 *
 * Specs that deliberately test *anonymous* behavior (login/registration/logout flows,
 * submission-login-required) must keep using the plain fixture.
 */
export const test = base.extend({
    page: async ({ page }, use) => {
        await loginTestUserWithCookies(page);
        await use(page);
    },
});

export { expect } from '@playwright/test';
export type { Page };
