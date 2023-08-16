import { expect, test as base } from '@playwright/test';

import { SearchPage } from './pages/search/search.page';
import { SequencePage } from './pages/sequences/sequences.page';

type E2EFixture = {
    searchPage: SearchPage;
    sequencePage: SequencePage;
};

export const baseUrl = 'http://localhost:3000';

export const testSequence = {
    name: 'OU189322',
    sequence: 'ACCAACCAAC',
    orf1a: 'MESLVPGFNE',
};

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
});

export { expect } from '@playwright/test';
