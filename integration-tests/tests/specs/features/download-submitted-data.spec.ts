import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { SearchPage } from '../../pages/search.page';
import { ReviewPage } from '../../pages/review.page';
import { SingleSequenceSubmissionPage } from '../../pages/submission.page';
import { createTestMetadata, createTestSequenceData } from '../../test-helpers/test-data';
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

const TEST_ORGANISM = 'ebola-sudan';
const SEARCH_INDEXING_TIMEOUT = 60000;

test.describe('Download Submitted Data', () => {
    test('can download submitted data for all sequences on released sequences page', async ({
        page,
        groupId,
    }) => {
        test.setTimeout(200_000);

        const submissionPage = new SingleSequenceSubmissionPage(page);
        const timestamp = Date.now();
        const submissionIds = Array.from(
            { length: 2 },
            (_, i) => `download-test-${timestamp}-${i}`,
        );

        for (const submissionId of submissionIds) {
            await submissionPage.completeSubmission(
                createTestMetadata({ submissionId }),
                createTestSequenceData(),
            );
        }

        const reviewPage = new ReviewPage(page);
        await reviewPage.goto(groupId);
        await reviewPage.waitForZeroProcessing();
        await reviewPage.releaseValidSequences();

        const searchPage = new SearchPage(page);
        await searchPage.goToReleasedSequences(TEST_ORGANISM, groupId);
        const accessionVersions = await searchPage.waitForSequencesInSearch(
            2,
            SEARCH_INDEXING_TIMEOUT,
        );

        expect(accessionVersions).toHaveLength(2);

        const downloadPromise = page.waitForEvent('download');
        await searchPage.downloadForBulkRevision();
        const download = await downloadPromise;

        const downloadPath = await download.path();
        expect(downloadPath).toBeTruthy();

        // Verify ZIP magic number (PK = 0x50 0x4B)
        const fileBuffer = fs.readFileSync(downloadPath);
        expect(fileBuffer[0]).toBe(0x50);
        expect(fileBuffer[1]).toBe(0x4b);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'download-test-'));
        try {
            execSync(`unzip -o "${downloadPath}" -d "${tmpDir}"`);

            const metadataPath = path.join(tmpDir, 'metadata.tsv');
            expect(fs.existsSync(metadataPath)).toBe(true);

            const sequencesPath = path.join(tmpDir, 'sequences.fasta');
            expect(fs.existsSync(sequencesPath)).toBe(true);

            const metadataContent = fs.readFileSync(metadataPath, 'utf8');
            const metadataLines = metadataContent
                .split('\n')
                .filter((line) => line.trim().length > 0);

            expect(metadataLines.length).toBe(3);

            const header = metadataLines[0].split('\t');
            expect(header).toContain('id');
            expect(header).toContain('accession');

            expect(metadataContent).toContain('Switzerland');
            expect(metadataContent).toContain('2021-01-15');
            expect(metadataContent).toContain('Test Institute');

            const idIndex = header.indexOf('id');
            const accessionIndex = header.indexOf('accession');

            const downloadedIds = metadataLines.slice(1).map((line) => line.split('\t')[idIndex]);
            const downloadedAccessions = metadataLines
                .slice(1)
                .map((line) => line.split('\t')[accessionIndex]);

            for (const submissionId of submissionIds) {
                expect(downloadedIds).toContain(submissionId);
            }

            for (const av of accessionVersions) {
                expect(downloadedAccessions).toContain(av.accession);
            }

            const fastaContent = fs.readFileSync(sequencesPath, 'utf8');
            const fastaHeaders = fastaContent.split('\n').filter((line) => line.startsWith('>'));

            expect(fastaHeaders.length).toBe(2);

            for (const submissionId of submissionIds) {
                expect(fastaHeaders.some((h) => h.includes(submissionId))).toBe(true);
            }
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('can download submitted data for selected sequences only', async ({ page, groupId }) => {
        test.setTimeout(200_000);

        const submissionPage = new SingleSequenceSubmissionPage(page);
        const timestamp = Date.now();

        for (let i = 0; i < 3; i++) {
            await submissionPage.completeSubmission(
                createTestMetadata({ submissionId: `select-download-${timestamp}-${i}` }),
                createTestSequenceData(),
            );
        }

        const reviewPage = new ReviewPage(page);
        await reviewPage.goto(groupId);
        await reviewPage.waitForZeroProcessing();
        await reviewPage.releaseValidSequences();

        const searchPage = new SearchPage(page);
        await searchPage.goToReleasedSequences(TEST_ORGANISM, groupId);
        const accessionVersions = await searchPage.waitForSequencesInSearch(
            3,
            SEARCH_INDEXING_TIMEOUT,
        );

        expect(accessionVersions).toHaveLength(3);

        const rows = searchPage.getSequenceRows();
        for (let i = 0; i < 2; i++) {
            const checkboxCell = rows.nth(i).locator('td').first();
            await checkboxCell.click();
        }

        await searchPage.openModifyEntriesMenu();
        await expect(
            page.getByRole('menuitem', { name: /Download data for bulk revision \(2 sequences\)/ }),
        ).toBeVisible();

        const downloadPromise = page.waitForEvent('download');
        await searchPage.downloadForBulkRevision({ menuAlreadyOpen: true });
        const download = await downloadPromise;

        const downloadPath = await download.path();
        expect(downloadPath).toBeTruthy();

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'select-download-test-'));
        try {
            execSync(`unzip -o "${downloadPath}" -d "${tmpDir}"`);

            const metadataPath = path.join(tmpDir, 'metadata.tsv');
            const metadataContent = fs.readFileSync(metadataPath, 'utf8');
            const metadataLines = metadataContent
                .split('\n')
                .filter((line) => line.trim().length > 0);

            expect(metadataLines.length).toBe(3);

            const sequencesPath = path.join(tmpDir, 'sequences.fasta');
            const fastaContent = fs.readFileSync(sequencesPath, 'utf8');
            const fastaHeaders = fastaContent.split('\n').filter((line) => line.startsWith('>'));

            expect(fastaHeaders.length).toBe(2);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
