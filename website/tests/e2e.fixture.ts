import { expect, test as base } from '@playwright/test';

import { SearchPage } from './pages/search/search.page';
import { SequencePage } from './pages/sequences/sequences.page';
import { SubmitPage } from './pages/submit/submit.page';
import { UserPage } from './pages/user/user.page';

type E2EFixture = {
    searchPage: SearchPage;
    sequencePage: SequencePage;
    submitPage: SubmitPage;
    userPage: UserPage;
};

export const baseUrl = 'http://localhost:3000';

export const testSequence = {
    name: 'OU189322',
    sequence: 'ACCAACCAAC',
    orf1a: 'MESLVPGFNE',
};

export const testuser = 'testuser';

export const test = base.extend<E2EFixture>({
    searchPage: async ({ page }, use) => {
        const searchPage = new SearchPage(page);
        await use(searchPage);
    },
    sequencePage: async ({ page }, use) => {
        const sequencePage = new SequencePage(page);
        await use(sequencePage);
    },
    submitPage: async ({ page }, use) => {
        const submitPage = new SubmitPage(page);
        await use(submitPage);
    },
    userPage: async ({ page }, use) => {
        const userPage = new UserPage(page);
        await use(userPage);
    },
});

export { expect } from '@playwright/test';
