import { expect, test as base } from '@playwright/test';

import { SearchPage } from './pages/search/search.page';
import { SequencePage } from './pages/sequences/sequences.page';
import { SubmitPage } from './pages/submit/submit.page';

type E2EFixture = {
    searchPage: SearchPage;
    sequencePage: SequencePage;
    submitPage: SubmitPage;
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
        await searchPage.goto();

        await use(searchPage);
    },
    sequencePage: async ({ page }, use) => {
        const sequencePage = new SequencePage(page);
        await sequencePage.goto();

        await use(sequencePage);
    },
    submitPage: async ({ page }, use) => {
        const submitPage = new SubmitPage(page);
        await submitPage.goto();

        await use(submitPage);
    },
});

export { expect } from '@playwright/test';
