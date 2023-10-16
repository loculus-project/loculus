import { test as base } from '@playwright/test';

import { RevisePage } from './pages/revise/revise.page';
import { SearchPage } from './pages/search/search.page';
import { SequencePage } from './pages/sequences/sequences.page';
import { SubmitPage } from './pages/submit/submit.page';
import { UserPage } from './pages/user/user.page';
import { DatasetPage } from './pages/datasets/dataset.page';

type E2EFixture = {
    searchPage: SearchPage;
    sequencePage: SequencePage;
    submitPage: SubmitPage;
    userPage: UserPage;
    datasetPage: DatasetPage;
    revisePage: RevisePage;
};

export const baseUrl = 'http://localhost:3000';
export const backendUrl = 'http://localhost:8079';

export const testSequence = {
    name: 'id_002156',
    orf1a: 'MESLVPGFNE',
};

export const testuser = 'testuser';

export const metadataTestFile: string = './tests/testData/metadata.tsv';
export const sequencesTestFile: string = './tests/testData/sequences.fasta';

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
    datasetPage: async ({ page }, use) => {
        const datasetPage = new DatasetPage(page);
        await use(datasetPage);
    },
    revisePage: async ({ page }, use) => {
        const revisePage = new RevisePage(page);
        await use(revisePage);
    },
});

export { expect } from '@playwright/test';
