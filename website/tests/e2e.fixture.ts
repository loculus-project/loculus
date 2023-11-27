import { readFileSync } from 'fs';

import { type Page, test as base } from '@playwright/test';
import { ResultAsync } from 'neverthrow';
import { Issuer } from 'openid-client';
import winston from 'winston';

import { ReviewPage } from './pages/review/review.page';
import { RevisePage } from './pages/revise/revise.page';
import { SearchPage } from './pages/search/search.page';
import { SequencePage } from './pages/sequences/sequences.page';
import { SubmitPage } from './pages/submit/submit.page';
import { UserPage } from './pages/user/user.page';
import { clientMetadata, realmPath, TOKEN_COOKIE } from '../src/middleware/authMiddleware';
import { BackendClient } from '../src/services/backendClient';
import { NavigationFixture } from './pages/navigation.fixture';

type E2EFixture = {
    searchPage: SearchPage;
    sequencePage: SequencePage;
    submitPage: SubmitPage;
    userPage: UserPage;
    revisePage: RevisePage;
    reviewPage: ReviewPage;
    navigationFixture: NavigationFixture;
    loginAsTestUser: () => Promise<void>;
};

export const dummyOrganism = { key: 'dummy-organism', displayName: 'Test Dummy Organism' };

export const baseUrl = 'http://localhost:3000';
export const backendUrl = 'http://localhost:8079';
export const lapisUrl = 'http://localhost:8080/dummy-organism';
const keycloakUrl = 'http://localhost:8083';

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

export const testUser = 'testuser';
const testUserPassword = 'testuser';

export const metadataTestFile: string = './tests/testData/metadata.tsv';
export const sequencesTestFile: string = './tests/testData/sequences.fasta';

export const testSequenceCount: number =
    readFileSync(metadataTestFile, 'utf-8')
        .split('\n')
        .filter((line) => line.length !== 0).length - 1;

const testUserTokens: Record<string, TokenSet> = {};

async function getToken(username: string, password: string) {
    const issuerUrl = `${keycloakUrl}${realmPath}`;
    const keycloakIssuer = await Issuer.discover(issuerUrl);
    const client = new keycloakIssuer.Client(clientMetadata);

    if (username in testUserTokens) {
        const accessToken = testUserTokens[username].access_token;
        if (accessToken !== undefined) {
            const userInfo = await ResultAsync.fromPromise(client.userinfo(accessToken), (error) => {
                return error;
            });

            if (userInfo.isOk()) {
                return testUserTokens[username];
            }
        }
    }

    const token = client.grant({
        grant_type: 'password',
        username,
        password,
        scope: 'openid',
    });

    testUserTokens[username] = await token;

    return token;
}

export async function authorize(
    page: Page,
    parallelIndex = test.info().parallelIndex,
    browser = page.context().browser(),
) {
    const username = `${testUser}_${parallelIndex}_${browser?.browserType().name()}`;
    const password = `${testUserPassword}_${parallelIndex}_${browser?.browserType().name()}`;

    const token = await getToken(username, password);

    await page.context().addCookies([
        {
            name: TOKEN_COOKIE,
            value: JSON.stringify(token),
            httpOnly: true,
            sameSite: 'Lax',
            secure: false,
            path: '/',
            domain: 'localhost',
        },
    ]);
}

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
    navigationFixture: async ({ page }, use) => {
        await use(new NavigationFixture(page));
    },
    loginAsTestUser: async ({ page }, use) => {
        await use(async () => authorize(page));
    },
});

export { expect } from '@playwright/test';
