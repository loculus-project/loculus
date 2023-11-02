import { readFileSync } from 'fs';

import { test as base } from '@playwright/test';
import winston from 'winston';

import { ReviewPage } from './pages/review/review.page';
import { RevisePage } from './pages/revise/revise.page';
import { SearchPage } from './pages/search/search.page';
import { SequencePage } from './pages/sequences/sequences.page';
import { SubmitPage } from './pages/submit/submit.page';
import { UserPage } from './pages/user/user.page';
import { BackendClient } from '../src/services/backendClient.ts';

type E2EFixture = {
    searchPage: SearchPage;
    sequencePage: SequencePage;
    submitPage: SubmitPage;
    userPage: UserPage;
    revisePage: RevisePage;
    reviewPage: ReviewPage;
};

export const baseUrl = 'http://localhost:3000';
export const backendUrl = 'http://localhost:8079';
export const lapisUrl = 'http://localhost:8080';

export const e2eLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [new winston.transports.Console()],
});

export const backendClient = BackendClient.create(backendUrl, e2eLogger);

export const testSequence = {
    name: '1.1',
    orf1a: 'QRFEINSA',
};

export const testuser = 'testuser';

export const metadataTestFile: string = './tests/testData/metadata.tsv';
export const sequencesTestFile: string = './tests/testData/sequences.fasta';

export const testSequenceCount: number =
    readFileSync(metadataTestFile, 'utf-8')
        .split('\n')
        .filter((line) => line.length !== 0).length - 1;

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
    revisePage: async ({ page }, use) => {
        const revisePage = new RevisePage(page);
        await use(revisePage);
    },
    reviewPage: async ({ page }, use) => {
        const reviewPage = new ReviewPage(page);
        await use(reviewPage);
    },
});

export { expect } from '@playwright/test';
