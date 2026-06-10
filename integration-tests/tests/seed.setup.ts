import { expect, request as playwrightRequest, test as setup } from '@playwright/test';

import { AuthPage } from './pages/auth.page';
import { GroupPage } from './pages/group.page';
import { SearchPage } from './pages/search.page';
import { SeqSetPage } from './pages/seqset.page';
import { BulkSubmissionPage } from './pages/submission.page';

/**
 * Seeds a dev/E2E deployment with a slice of SeqSet-citation data so the feature
 * is visibly populated on a fresh deployment:
 *   1. submit a few sequences to the dummy organism and release them,
 *   2. build a SeqSet from the released accessions,
 *   3. add a curated citation via the superuser-only /create-curated-citation endpoint.
 *
 * Everything runs as the dev super user, which can submit, create SeqSets and add
 * curated citations. Only enabled via the `seed` Playwright project (RUN_SEED=true),
 * so normal test runs never trigger it.
 */

const SUPER_USER = process.env.SEED_SUPER_USER ?? 'superuser';
const SUPER_USER_PASSWORD = process.env.SEED_SUPER_USER_PASSWORD ?? 'superuser';

const DUMMY_ORGANISM_DISPLAY_NAME = 'Test Dummy Organism';
const DUMMY_ORGANISM_URL_NAME = 'dummy-organism';
// Minimal valid dummy-organism nucleotide sequence (see backend TestHelpers).
const DUMMY_MAIN_SEQUENCE = 'ATTAAAGGTTTATACCTTCCCAGGTAACAAACCAACCAACTTTCGATCT';

const SEQSET_NAME = 'Seed SeqSet';
const SEQSET_DESCRIPTION = 'Auto-seeded SeqSet for dev deployments';

const seedGroup = {
    name: 'Seed data group',
    email: 'seed-group@example.com',
    institution: 'Seed Institute',
    addressLine1: '1 Seed Street',
    city: 'Seedville',
    zipCode: '12345',
    country: 'USA',
};

// dummy-organism metadata: submissionId + the required `date`, `country` and `pangoLineage` fields.
const METADATA_HEADERS = ['submissionId', 'date', 'country', 'pangoLineage'];
const SUBMISSIONS = [
    ['seed-1', '2021-01-05', 'Germany', 'A'],
    ['seed-2', '2021-02-10', 'Canada', 'A.1'],
    ['seed-3', '2021-03-15', 'New Zealand', 'B'],
];

const ACCESSION_PATTERN = /(LOC_[A-Z0-9]+)/;

/**
 * Resolve the backend base URL. In-cluster, set PLAYWRIGHT_TEST_BACKEND_URL to the
 * backend service (e.g. http://loculus-backend-service:8079). Falls back to the
 * localhost backend port for local k3d runs.
 */
function getBackendBaseUrl(): URL {
    const configured = process.env.PLAYWRIGHT_TEST_BACKEND_URL;
    if (configured !== undefined && configured !== '') {
        return new URL(configured);
    }

    const baseUrl = new URL(process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000');
    if (baseUrl.hostname === 'localhost' || baseUrl.hostname === '127.0.0.1') {
        const protocol = baseUrl.protocol === 'https:' ? 'https:' : 'http:';
        return new URL(`${protocol}//localhost:8079`);
    }

    const backendHostname = baseUrl.hostname.startsWith('backend')
        ? baseUrl.hostname
        : `backend-${baseUrl.hostname}`;
    return new URL(`${baseUrl.protocol}//${backendHostname}`);
}

setup('Seed dummy-organism sequences, a SeqSet and a curated citation', async ({ page }) => {
    setup.setTimeout(600_000);

    const authPage = new AuthPage(page);
    const loggedIn = await authPage.login(SUPER_USER, SUPER_USER_PASSWORD);
    if (!loggedIn) {
        throw new Error(
            `Could not log in as super user '${SUPER_USER}'. Is createTestAccounts enabled?`,
        );
    }

    const groupPage = new GroupPage(page);
    const groupId = await groupPage.getOrCreateGroup(seedGroup);

    // Idempotency: if the seed SeqSet already exists, there is nothing to do.
    const seqSetPage = new SeqSetPage(page);
    await seqSetPage.gotoList();
    if ((await page.getByRole('cell', { name: SEQSET_NAME }).count()) > 0) {
        setup.skip(true, 'Seed data already present');
        return;
    }

    // 1. Submit the dummy-organism sequences in bulk and release them.
    const submissionPage = new BulkSubmissionPage(page);
    await submissionPage.navigateToSubmissionPage(DUMMY_ORGANISM_DISPLAY_NAME);
    await submissionPage.uploadMetadataFile(METADATA_HEADERS, SUBMISSIONS);
    await submissionPage.uploadSequencesFile(
        Object.fromEntries(SUBMISSIONS.map(([id]) => [id, DUMMY_MAIN_SEQUENCE])),
    );
    const reviewPage = await submissionPage.submitAndWaitForProcessingDone();
    await reviewPage.releaseAndGoToReleasedSequences();

    // 2. Collect the released accessions for this group.
    const searchPage = new SearchPage(page);
    const accessions = await collectReleasedAccessions(searchPage, groupId, SUBMISSIONS.length);

    // 3. Create a SeqSet referencing the released accessions (first focal, rest background).
    await seqSetPage.gotoList();
    await seqSetPage.createSeqSet({
        name: SEQSET_NAME,
        description: SEQSET_DESCRIPTION,
        focalAccessions: [accessions[0]],
        backgroundAccessions: accessions.slice(1),
    });
    await page.waitForURL(/\/seqsets\/.+\.\d+$/);

    // The SeqSet detail URL is /seqsets/<seqSetId>.<version>.
    const seqSetAccession = page.url().split('/seqsets/')[1];
    const lastDot = seqSetAccession.lastIndexOf('.');
    const seqSetId = seqSetAccession.slice(0, lastDot);
    const seqSetVersion = Number(seqSetAccession.slice(lastDot + 1));

    // 4. Add a curated citation via the superuser-only endpoint, using the logged-in token.
    const cookies = await page.context().cookies();
    const token = cookies.find((cookie) => cookie.name === 'access_token')?.value;
    if (token === undefined) {
        throw new Error('Could not read access_token cookie to authenticate the citation request.');
    }

    const backendUrl = getBackendBaseUrl();
    const apiContext = await playwrightRequest.newContext({
        baseURL: backendUrl.origin,
        ignoreHTTPSErrors: process.env.PLAYWRIGHT_TEST_IGNORE_HTTPS_ERRORS === 'true',
    });
    const response = await apiContext.post('/create-curated-citation', {
        headers: { Authorization: `Bearer ${token}` },
        data: {
            seqSetId,
            seqSetVersion,
            source: {
                sourceDOI: '10.0000/seed-citation-1',
                title: 'Seed reference publication',
                year: 2024,
                contributors: [{ givenName: 'Ada', surname: 'Lovelace' }],
            },
        },
    });
    expect(
        response.ok(),
        `create-curated-citation failed: ${response.status()} ${await response.text()}`,
    ).toBeTruthy();
    await apiContext.dispose();
});

/**
 * Navigate to the group's released sequences and collect distinct LOC accessions,
 * reloading until enough have become visible (release/indexing is asynchronous).
 */
async function collectReleasedAccessions(
    searchPage: SearchPage,
    groupId: number,
    minCount: number,
): Promise<string[]> {
    let accessions: string[] = [];
    await expect
        .poll(
            async () => {
                await searchPage.goToReleasedSequences(DUMMY_ORGANISM_URL_NAME, groupId);
                const rows = searchPage.getSequenceRows();
                const rowCount = await rows.count();
                const found = new Set<string>();
                for (let index = 0; index < rowCount; index += 1) {
                    const match = (await rows.nth(index).innerText()).match(ACCESSION_PATTERN);
                    if (match !== null) {
                        found.add(match[1]);
                    }
                }
                accessions = Array.from(found);
                return accessions.length;
            },
            {
                message: `Expected ${minCount} released seed sequences to become visible.`,
                timeout: 120_000,
            },
        )
        .toBeGreaterThanOrEqual(minCount);

    return accessions;
}
