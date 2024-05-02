import { readFileSync } from 'fs';

import { type Page, test as base } from '@playwright/test';
import { ResultAsync } from 'neverthrow';
import { Issuer } from 'openid-client';
import winston from 'winston';

import { EditPage } from './pages/edit/edit.page';
import { NavigationFixture } from './pages/navigation.fixture';
import { ReviewPage } from './pages/review/review.page.ts';
import { RevisePage } from './pages/revise/revise.page';
import { SearchPage } from './pages/search/search.page';
import { SeqSetPage } from './pages/seqsets/seqset.page';
import { SequencePage } from './pages/sequences/sequences.page';
import { SubmitPage } from './pages/submission/submit.page';
import { GroupPage } from './pages/user/group/group.page.ts';
import { UserPage } from './pages/user/userPage/userPage.ts';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '../src/middleware/authMiddleware';
import { BackendClient } from '../src/services/backendClient';
import { GroupManagementClient } from '../src/services/groupManagementClient.ts';
import { type DataUseTerms, type NewGroup, openDataUseTermsType } from '../src/types/backend.ts';
import { clientMetadata } from '../src/utils/clientMetadata.ts';
import { realmPath } from '../src/utils/realmPath.ts';

type E2EFixture = {
    searchPage: SearchPage;
    sequencePage: SequencePage;
    submitPage: SubmitPage;
    reviewPage: ReviewPage;
    seqSetPage: SeqSetPage;
    userPage: UserPage;
    groupPage: GroupPage;
    revisePage: RevisePage;
    editPage: EditPage;
    navigationFixture: NavigationFixture;
    loginAsTestUser: () => Promise<{ username: string; token: string; groupName: string; groupId: number }>;
};

export const dummyOrganism = { key: 'dummy-organism', displayName: 'Test Dummy Organism' };
export const openDataUseTerms: DataUseTerms = {
    type: openDataUseTermsType,
};

export const baseUrl = 'http://localhost:3000';
export const backendUrl = 'http://localhost:8079';
export const lapisUrl = 'http://localhost:8080/dummy-organism';
const keycloakUrl = 'http://localhost:8083';

export const DEFAULT_GROUP_NAME = 'testGroup';
export const DEFAULT_GROUP: NewGroup = {
    groupName: DEFAULT_GROUP_NAME,
    institution: 'testInstitution',
    address: {
        line1: 'testLine1',
        line2: 'testLine2',
        city: 'testCity',
        postalCode: 'testPostalCode',
        state: 'testState',
        country: 'testCountry',
    },
    contactEmail: 'testContactEmail@mail.com',
} as const;

export const e2eLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [new winston.transports.Console()],
});

export const backendClient = BackendClient.create(backendUrl, e2eLogger);
export const groupManagementClient = GroupManagementClient.create(backendUrl, e2eLogger);

export const testSequenceEntryData = {
    unaligned: 'A'.repeat(123),
    orf1a: 'QRFEINSA',
};

export const testUser = 'testuser';
export const testUserPassword = 'testuser';

export const metadataTestFile: string = './tests/testData/metadata.tsv';
export const compressedMetadataTestFile: string = './tests/testData/metadata.tsv.zst';
export const sequencesTestFile: string = './tests/testData/sequences.fasta';
export const compressedSequencesTestFile: string = './tests/testData/sequences.fasta.zst';

export const testSequenceCount: number =
    readFileSync(metadataTestFile, 'utf-8')
        .split('\n')
        .filter((line) => line.length !== 0).length - 1;

const testUserTokens: Record<string, TokenCookie> = {};

export async function getToken(username: string, password: string) {
    const issuerUrl = `${keycloakUrl}${realmPath}`;
    const keycloakIssuer = await Issuer.discover(issuerUrl);
    const client = new keycloakIssuer.Client(clientMetadata);

    if (username in testUserTokens) {
        const accessToken = testUserTokens[username].accessToken;

        const userInfo = await ResultAsync.fromPromise(client.userinfo(accessToken), (error) => {
            return error;
        });

        if (userInfo.isOk()) {
            return testUserTokens[username];
        }
    }

    // eslint-disable-next-line
    const { access_token, refresh_token } = await client.grant({
        grant_type: 'password',
        username,
        password,
        scope: 'openid',
    });

    if (access_token === undefined || refresh_token === undefined) {
        throw new Error('Failed to get token');
    }

    const token: TokenCookie = {
        accessToken: access_token,
        refreshToken: refresh_token,
    };

    testUserTokens[username] = token;

    return token;
}

export async function authorize(
    page: Page,
    parallelIndex = test.info().parallelIndex,
    browser = page.context().browser(),
) {
    const username = `${testUser}_${parallelIndex}_${browser?.browserType().name()}`;
    const password = `${testUserPassword}_${parallelIndex}_${browser?.browserType().name()}`;
    const groupName = username + '-group';

    const token = await getToken(username, password);

    const groupId = await createTestGroupIfNotExistent(token.accessToken, { ...DEFAULT_GROUP, groupName });

    await page.context().addCookies([
        {
            name: ACCESS_TOKEN_COOKIE,
            value: token.accessToken,
            httpOnly: true,
            sameSite: 'Lax',
            secure: false,
            path: '/',
            domain: 'localhost',
        },
        {
            name: REFRESH_TOKEN_COOKIE,
            value: token.refreshToken,
            httpOnly: true,
            sameSite: 'Lax',
            secure: false,
            path: '/',
            domain: 'localhost',
        },
    ]);

    return {
        username,
        groupName,
        groupId,
        token: token.accessToken,
    };
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
    reviewPage: async ({ page }, use) => {
        const reviewPage = new ReviewPage(page);
        await use(reviewPage);
    },
    userPage: async ({ page }, use) => {
        const userPage = new UserPage(page);
        await use(userPage);
    },
    groupPage: async ({ page }, use) => {
        const groupPage = new GroupPage(page);
        await use(groupPage);
    },
    seqSetPage: async ({ page }, use) => {
        const seqSetPage = new SeqSetPage(page);
        await use(seqSetPage);
    },
    revisePage: async ({ page }, use) => {
        const revisePage = new RevisePage(page);
        await use(revisePage);
    },
    editPage: async ({ page }, use) => {
        const editPage = new EditPage(page);
        await use(editPage);
    },
    navigationFixture: async ({ page }, use) => {
        await use(new NavigationFixture(page));
    },
    loginAsTestUser: async ({ page }, use) => {
        await use(async () => authorize(page));
    },
});

export async function createTestGroupIfNotExistent(token: string, group: NewGroup = DEFAULT_GROUP) {
    const existingGroup = await groupManagementClient
        .getGroupsOfUser(token)
        .then((groups) => groups._unsafeUnwrap().find((existingGroup) => existingGroup.groupName === group.groupName));

    if (existingGroup === undefined) {
        return groupManagementClient.createGroup(token, group).then((newGroup) => newGroup._unsafeUnwrap().groupId);
    }

    return existingGroup.groupId;
}

export { expect } from '@playwright/test';
