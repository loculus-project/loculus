/**
 * Exploratory / characterization tests for "interesting" characters in submission
 * metadata for Ebola Sudan: null bytes, botched unicode, emoji, RTL overrides,
 * markup-looking text, very long strings, etc.
 *
 * Goal: submit and release the data so its behaviour can be inspected manually on
 * the website (e.g. against https://main.loculus.org). These tests are intentionally
 * tolerant: they never fail on submission/release rejection (that is a valid outcome
 * worth observing). Instead they record what happened via test annotations and the
 * console, and only assert that the app stays responsive (no crash / blank page).
 *
 * Run against main:
 *   PLAYWRIGHT_TEST_BASE_URL=https://main.loculus.org \
 *     npx playwright test submission-edge-cases --project=chromium --reporter=list
 *
 * Because these submit weird-but-valid UTF-8 strings, they intentionally do NOT use
 * the shared console-warnings fixture (some inputs legitimately trigger backend 400s
 * or React warnings that would otherwise fail the run). A minimal auth + group
 * fixture chain is rebuilt locally on the plain Playwright base.
 */
import { test as base, expect, type Page, type TestInfo } from '@playwright/test';
import { randomUUID } from 'crypto';
import { AuthPage } from '../../pages/auth.page';
import { GroupPage } from '../../pages/group.page';
import { buildTestGroup } from '../../utils/testGroup';
import { BulkSubmissionPage } from '../../pages/submission.page';
import { ReviewPage } from '../../pages/review.page';
import { SearchPage } from '../../pages/search.page';
import { EBOLA_SUDAN_FULL_SEQUENCE } from '../../test-helpers/test-data';
import { TestAccount } from '../../types/auth.types';

const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : JSON.stringify(error);

// Console-tolerant fixture chain (mirrors auth.fixture + group.fixture, minus the
// console-warnings page wrapper).
const test = base.extend<{ authenticatedUser: TestAccount; groupId: number }>({
    authenticatedUser: async ({ page }, use) => {
        const account: TestAccount = {
            username: `test_user_${randomUUID().slice(0, 8)}`,
            password: 'password',
            email: `test_${randomUUID().slice(0, 8)}@test.com`,
            firstName: 'Test',
            lastName: 'User',
            organization: 'Test University',
        };
        await new AuthPage(page).createAccount(account);
        await use(account);
    },
    groupId: async ({ page, authenticatedUser }, use) => {
        void authenticatedUser;
        const groupId = await new GroupPage(page).createGroup(buildTestGroup());
        await use(groupId);
    },
});

// Tracing is disabled by default (it's not needed for the exploratory runs and the trace
// the framework writes during teardown is easy to corrupt if anything else touches
// test-results/ mid-run). To capture traces when debugging manually, run with
// EDGE_CASE_TRACE=on, in ISOLATION and with the timeout disabled, e.g.:
//
//   EDGE_CASE_TRACE=on PLAYWRIGHT_TEST_BASE_URL=https://main.loculus.org BROWSER=chromium \
//     npx playwright test submission-edge-cases --project=chromium-without-dep \
//     -g "emoji in submissionId" --workers=1 --timeout=0
//
// Then view with `npx playwright show-report` (traces attached) or
// `npx playwright show-trace test-results/<dir>/trace.zip`.
//
// Important: don't run a second Playwright command (or delete test-results/) while a traced
// run is in flight — Playwright wipes test-results/ at startup, which deletes the in-flight
// run's trace staging dir and yields `ENOENT ... .trace`. `--timeout=0` is needed because
// the per-test teardown budget (where the trace is saved) is pinned to the config timeout
// and is NOT raised by test.setTimeout / describe.configure.
const TRACE_ENABLED = process.env.EDGE_CASE_TRACE === 'on';
test.use({ trace: TRACE_ENABLED ? 'on' : 'off' });

// Full-length sequence so that processing aligns it and the entry is valid/releasable.
const SEQUENCE = EBOLA_SUDAN_FULL_SEQUENCE;
const enc = (s: string) => Buffer.from(s, 'utf8');
const NL = Buffer.from('\n');

const QUOTE = 0x22; // "
const TAB_BYTE = 0x09;
const LF_BYTE = 0x0a;
const CR_BYTE = 0x0d;

/**
 * RFC4180-style TSV cell. If the value contains a tab/newline/CR/quote it is wrapped in
 * double quotes (with internal quotes doubled) so it stays a single cell; otherwise it is
 * emitted verbatim. This lets us put embedded newlines/tabs into free-text fields and see
 * whether they survive the upload. Clean values (the common case) are unchanged, so the
 * submissionId still matches the (unquoted) FASTA header.
 */
function tsvCell(value: Buffer): Buffer {
    const needsQuoting =
        value.includes(QUOTE) ||
        value.includes(TAB_BYTE) ||
        value.includes(LF_BYTE) ||
        value.includes(CR_BYTE);
    if (!needsQuoting) {
        return value;
    }
    const escaped: number[] = [QUOTE];
    for (let i = 0; i < value.length; i++) {
        const b = value[i];
        if (b === QUOTE) escaped.push(QUOTE);
        escaped.push(b);
    }
    escaped.push(QUOTE);
    return Buffer.from(escaped);
}

function tsvRow(cells: Buffer[]): Buffer {
    const tab = Buffer.from('\t');
    const parts: Buffer[] = [];
    cells.forEach((cell, i) => {
        if (i > 0) parts.push(tab);
        parts.push(tsvCell(cell));
    });
    parts.push(NL);
    return Buffer.concat(parts);
}

/**
 * Build byte-exact metadata TSV + sequences FASTA for a single Ebola Sudan entry.
 * The submissionId is inserted verbatim into both the TSV cell and the FASTA header
 * (they must match), so it is passed as raw bytes. geoLocCountry/sampleCollectionDate
 * are kept valid so that submissionId / authorAffiliations are the only variables.
 *
 * Note: bulk-upload column headers are the raw input field *keys* (geoLocCountry,
 * sampleCollectionDate), not the friendly form labels ("Collection country" etc.).
 */
// The `authors` field is format-validated (check_authors: ASCII `last, first;` only), so
// it can't hold the descriptive label. But the sequence-details modal only renders
// `authorAffiliations` when `authors` is non-empty (DataTable.tsx), so we still submit a
// valid placeholder author to make the affiliations visible.
const PLACEHOLDER_AUTHORS = 'EdgeCase, Test';

// Today's date so released sequences sort to the top of the default (date-desc) search view.
const TODAY = new Date().toISOString().slice(0, 10);

function buildBulkBuffers(submissionId: Buffer, authorAffiliations: Buffer, caseLabel: string) {
    // The human-readable case label goes in `geoLocAdmin1` ("Collection subdivision level 1"):
    // it's a free-text field that is an initially-visible search column, so the sequence is
    // easy to recognise live (the submissionId itself is often unreadable, e.g. emoji /
    // null byte).
    const header = enc(
        'submissionId\tgeoLocCountry\tsampleCollectionDate\tauthorAffiliations\tauthors\tgeoLocAdmin1\n',
    );
    const row = tsvRow([
        submissionId,
        enc('France'),
        enc(TODAY),
        authorAffiliations,
        enc(PLACEHOLDER_AUTHORS),
        enc(caseLabel),
    ]);
    const tsv = Buffer.concat([header, row]);
    const fasta = Buffer.concat([enc('>'), submissionId, NL, enc(SEQUENCE), NL]);
    return { tsv, fasta };
}

type EdgeCase = {
    title: string;
    /** Bytes used for the submissionId (in both TSV cell and FASTA header). */
    submissionId: Buffer;
    /** Free-text authorAffiliations value. */
    authorAffiliations: string;
};

const DEFAULT_AFFILIATION = 'Edge Case Institute';

// Note: submissionIds must not contain whitespace/tab/newline — a tab/newline would
// break the TSV structure and whitespace would be treated as a FASTA header description
// (splitting it from the id and breaking the id<->header match).
const submissionIdCases: EdgeCase[] = [
    {
        title: 'emoji in submissionId',
        submissionId: enc('ebola-🦠-sudan-😀'),
        authorAffiliations: DEFAULT_AFFILIATION,
    },
    {
        title: 'combining diacritics in submissionId',
        submissionId: enc('café-crême-naño'),
        authorAffiliations: DEFAULT_AFFILIATION,
    },
    {
        title: 'RTL-override, zero-width and BOM chars in submissionId',
        submissionId: enc('id‮gnirts​zwsp﻿bom'),
        authorAffiliations: DEFAULT_AFFILIATION,
    },
    {
        title: 'HTML/script-like submissionId',
        submissionId: enc('<script>alert(1)</script>'),
        authorAffiliations: DEFAULT_AFFILIATION,
    },
    {
        title: 'path-traversal-like submissionId',
        submissionId: enc('../../etc/passwd'),
        authorAffiliations: DEFAULT_AFFILIATION,
    },
    {
        title: 'quotes, ampersands and template-literal-like submissionId',
        submissionId: enc(`id"with'quotes&amp;<>\${injection}`),
        authorAffiliations: DEFAULT_AFFILIATION,
    },
    {
        title: 'very long submissionId (500 chars)',
        submissionId: enc('L'.repeat(500)),
        authorAffiliations: DEFAULT_AFFILIATION,
    },
    {
        title: 'null byte in submissionId',
        submissionId: Buffer.concat([enc('null'), Buffer.from([0x00]), enc('byte')]),
        authorAffiliations: DEFAULT_AFFILIATION,
    },
    {
        title: 'invalid UTF-8 bytes in submissionId',
        submissionId: Buffer.concat([
            enc('badutf'),
            Buffer.from([0xff, 0xfe, 0x80, 0xc0]),
            enc('end'),
        ]),
        authorAffiliations: DEFAULT_AFFILIATION,
    },
];

// "Interesting characters in general string fields": keep the submissionId clean and
// unique, vary the free-text authorAffiliations field instead.
const stringFieldCases: EdgeCase[] = [
    {
        title: 'emoji + RTL + zero-width in authorAffiliations',
        submissionId: enc(`strfield-emoji-${randomUUID().slice(0, 8)}`),
        authorAffiliations: 'Universität 🦠 ‮desrever​ Institute, Zürich',
    },
    {
        title: 'HTML/script-like authorAffiliations',
        submissionId: enc(`strfield-html-${randomUUID().slice(0, 8)}`),
        authorAffiliations: '<img src=x onerror=alert(1)> & <b>Bold Lab</b> "quoted"',
    },
    {
        title: 'very long authorAffiliations (1000 chars)',
        submissionId: enc(`strfield-long-${randomUUID().slice(0, 8)}`),
        authorAffiliations: 'Affiliation ' + 'x'.repeat(1000),
    },
];

// Control characters in an unregulated free-text field (authorAffiliations). These rely on
// RFC4180 quoting (see tsvCell) so the embedded tab/newline stays inside one cell; the test
// reveals whether such characters survive the upload + processing pipeline.
const controlCharCases: EdgeCase[] = [
    {
        title: 'newline (LF) inside authorAffiliations',
        submissionId: enc(`ctrl-lf-${randomUUID().slice(0, 8)}`),
        authorAffiliations: 'Line one\nLine two\nLine three',
    },
    {
        title: 'CRLF inside authorAffiliations',
        submissionId: enc(`ctrl-crlf-${randomUUID().slice(0, 8)}`),
        authorAffiliations: 'Windows\r\nstyle\r\nbreaks',
    },
    {
        title: 'tab inside authorAffiliations',
        submissionId: enc(`ctrl-tab-${randomUUID().slice(0, 8)}`),
        authorAffiliations: 'Col A\tCol B\tCol C',
    },
    {
        title: 'misc control chars (VT, FF, ESC, BEL) inside authorAffiliations',
        submissionId: enc(`ctrl-misc-${randomUUID().slice(0, 8)}`),
        authorAffiliations: 'a\x0bb\x0cc\x1bd\x07e',
    },
];

async function runEdgeCase(
    page: Page,
    testInfo: TestInfo,
    groupId: number,
    category: string,
    edgeCase: EdgeCase,
) {
    // Body covers submission + preprocessing + post-release search indexing (LAPIS),
    // which can take a while; keep a generous-but-bounded cap (more when tracing).
    test.setTimeout(TRACE_ENABLED ? 300_000 : 150_000);

    // Succinct case summary, stored in geoLocAdmin1 so the case is identifiable on the
    // live website's default search view.
    void category;
    const caseLabel = edgeCase.title;

    try {
        const submissionPage = new BulkSubmissionPage(page);
        await submissionPage.navigateToSubmissionPage('Ebola Sudan');

        const { tsv, fasta } = buildBulkBuffers(
            edgeCase.submissionId,
            enc(edgeCase.authorAffiliations),
            caseLabel,
        );
        await submissionPage.uploadRawSequenceFile(fasta);
        await submissionPage.uploadRawMetadataFile(tsv);
        await submissionPage.acceptTerms();

        let reviewPage: ReviewPage | null = null;
        try {
            reviewPage = await submissionPage.submitSequence();
        } catch (error) {
            testInfo.annotations.push({
                type: 'submission-rejected',
                description: errorMessage(error),
            });
        }

        if (reviewPage === null) {
            const bodyText =
                (await page
                    .locator('body')
                    .innerText()
                    .catch(() => '')) || '';

            console.log(`[edge-case] "${edgeCase.title}": submission did NOT reach review page.`);
            testInfo.annotations.push({ type: 'page-text', description: bodyText.slice(0, 800) });
            // App must still be responsive, not a blank/crashed page.
            await expect(page.locator('body')).toBeVisible();
            return;
        }

        await reviewPage.waitForZeroProcessing();
        const overview = await reviewPage.getReviewPageOverview();

        // Capture the processing breakdown (no issues / warnings / errors) for inspection.
        const panelText = (
            (await page
                .getByTestId('review-page-control-panel')
                .innerText()
                .catch(() => '')) || ''
        ).replace(/\s+/g, ' ');

        console.log(
            `[edge-case] "${edgeCase.title}": reached review, ${overview.processed}/${overview.total} processed | ${panelText}`,
        );
        testInfo.annotations.push({
            type: 'review-overview',
            description: `${overview.processed}/${overview.total} processed | ${panelText}`,
        });

        // Best-effort release so released data is visible in search for manual inspection.
        // Bounded wait: if there are no valid sequences (e.g. the input caused a processing
        // error) the release button never appears, so we annotate and move on instead of
        // blocking for the whole test timeout.
        const releaseButton = page.getByRole('button', { name: /Approve \d+ valid sequence/ });
        let released = false;
        try {
            await releaseButton.waitFor({ state: 'visible', timeout: 15_000 });
            await releaseButton.click();
            await page.getByRole('button', { name: 'Approve', exact: true }).click();
            await expect(page.getByText(/(Sequence|have been) approved/)).toBeVisible();
            released = true;

            console.log(`[edge-case] "${edgeCase.title}": released.`);
            testInfo.annotations.push({
                type: 'released',
                description: 'valid sequences released',
            });
        } catch (error) {
            console.log(
                `[edge-case] "${edgeCase.title}": release skipped (${errorMessage(error)}).`,
            );
            testInfo.annotations.push({
                type: 'release-skipped',
                description: errorMessage(error),
            });
        }

        // After release, verify the sequence is actually findable in the search UI and that
        // its detail page (/seq/<accessionVersion>) renders. Best-effort: log which cases
        // fail rather than failing the test.
        if (released) {
            try {
                const searchPage = new SearchPage(page);
                await searchPage.goToReleasedSequences('ebola-sudan', groupId);
                const accessions = await searchPage.waitForSequencesInSearch(1, 90_000);
                const accessionVersion = accessions[0].accessionVersion;
                console.log(
                    `[edge-case] "${edgeCase.title}": found in search as ${accessionVersion}.`,
                );
                testInfo.annotations.push({ type: 'in-search', description: accessionVersion });

                await page.goto(`/seq/${accessionVersion}`);
                // The case label lives in specimenCollectorSampleId ("Isolate name") and is
                // shown on the detail page; its presence confirms the page rendered the data.
                await expect(page.getByText(caseLabel).first()).toBeVisible({ timeout: 20_000 });
                console.log(
                    `[edge-case] "${edgeCase.title}": detail page /seq/${accessionVersion} OK.`,
                );
                testInfo.annotations.push({ type: 'detail-page', description: 'rendered OK' });
            } catch (error) {
                console.log(
                    `[edge-case] "${edgeCase.title}": search/detail FAILED (${errorMessage(error)}).`,
                );
                testInfo.annotations.push({
                    type: 'search-detail-failed',
                    description: errorMessage(error),
                });
            }
        }

        await expect(page.locator('body')).toBeVisible();
    } finally {
        // Navigate to a blank page so nothing on the review/detail page is in flight during
        // context teardown (a small belt-and-braces alongside trace:'off').
        await page.goto('about:blank').catch(() => {});
    }
}

test.describe('Submission edge cases: interesting characters in submissionId', () => {
    for (const edgeCase of submissionIdCases) {
        test(edgeCase.title, async ({ page, groupId }, testInfo) => {
            await runEdgeCase(page, testInfo, groupId, 'submissionId', edgeCase);
        });
    }
});

test.describe('Submission edge cases: interesting characters in string fields', () => {
    for (const edgeCase of stringFieldCases) {
        test(edgeCase.title, async ({ page, groupId }, testInfo) => {
            await runEdgeCase(page, testInfo, groupId, 'authorAffiliations', edgeCase);
        });
    }
});

test.describe('Submission edge cases: control characters in free-text fields', () => {
    for (const edgeCase of controlCharCases) {
        test(edgeCase.title, async ({ page, groupId }, testInfo) => {
            await runEdgeCase(page, testInfo, groupId, 'controlChars', edgeCase);
        });
    }
});
