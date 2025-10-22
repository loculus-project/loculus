/**
 * Reusable workflow helpers for common sequence operations in integration tests.
 * These helpers encapsulate common patterns like submitting, releasing, and revising sequences.
 */

import { expect, Page } from '@playwright/test';
import { ReviewPage } from '../pages/review.page';
import { SearchPage } from '../pages/search.page';
import { SingleSequenceSubmissionPage } from '../pages/submission.page';
import {
    createTestMetadata,
    createTestSequenceData,
    EBOLA_SUDAN_SHORT_SEQUENCE,
} from './test-data';

/**
 * Submit a sequence and release it through the review page.
 * @param page The page object
 * @param groupId The group ID to submit to
 * @param submissionId The submission ID for the sequence
 */
export async function submitAndReleaseSequence(
    page: Page,
    groupId: number,
    submissionId: string,
): Promise<void> {
    const submissionPage = new SingleSequenceSubmissionPage(page);
    await submissionPage.completeSubmission(
        createTestMetadata({ submissionId }),
        createTestSequenceData(),
    );

    // completeSubmission navigates to review page, so we should already be there
    const reviewPage = new ReviewPage(page);
    await reviewPage.waitForZeroProcessing();
    await reviewPage.releaseValidSequences();
}

/**
 * Submit a revision for an existing sequence.
 * @param page The page object
 * @param groupId The group ID
 * @param originalAccession The accession version to revise (e.g., LOC_XXXXX.1)
 * @param revisedSubmissionId The submission ID for the revision
 * @param sequenceModification String to append to the base sequence (e.g., 'GGGG')
 * @param organism The organism key (defaults to 'ebola-sudan')
 */
export async function submitRevision(
    page: Page,
    groupId: number,
    originalAccession: string,
    revisedSubmissionId: string,
    sequenceModification: string,
    organism: string = 'ebola-sudan',
): Promise<void> {
    // Navigate to the sequence details page
    await page.goto(`/${organism}/seq/${originalAccession}`);
    await expect(page.getByRole('heading', { name: originalAccession })).toBeVisible();

    // Click the "Revise this sequence" link
    await page.getByRole('link', { name: 'Revise this sequence' }).click({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Create new revision from' })).toBeVisible();

    // Upload the revised sequence file
    const revisedSequence = EBOLA_SUDAN_SHORT_SEQUENCE + sequenceModification;
    await page.getByTestId('main_segment_file').setInputFiles({
        name: 'revised.fasta',
        mimeType: 'text/plain',
        buffer: Buffer.from(`>${revisedSubmissionId}\n${revisedSequence}`),
    });

    // Submit the revision
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
}

/**
 * Release sequences from the review page and wait for search indexing to complete.
 * @param page The page object
 * @param groupId The group ID
 * @param organism The organism key (defaults to 'ebola-sudan')
 */
export async function releaseSequencesAndWaitForIndexing(
    page: Page,
    groupId: number,
    organism: string = 'ebola-sudan',
): Promise<void> {
    const reviewPage = new ReviewPage(page);

    // Ensure we're on the review page (navigate if needed)
    if (!page.url().includes('/review')) {
        await reviewPage.goto(groupId);
    }

    await reviewPage.waitForZeroProcessing();
    await reviewPage.releaseValidSequences();

    // Wait for search indexing by searching and waiting for results
    const searchPage = new SearchPage(page);
    await searchPage.searchByGroupId(organism, groupId);
    await page.waitForTimeout(3000); // Give search index time to update
}

/**
 * Get the first accession version from search results for a specific group.
 * @param page The page object
 * @param groupId The group ID to search for
 * @param organism The organism key (defaults to 'ebola-sudan')
 * @returns The first accession version (e.g., LOC_XXXXX.1)
 */
export async function getFirstAccessionFromSearch(
    page: Page,
    groupId: number,
    organism: string = 'ebola-sudan',
): Promise<string> {
    const searchPage = new SearchPage(page);
    await searchPage.searchByGroupId(organism, groupId);
    const accessions = await searchPage.waitForSequencesInSearch(1, 60000);
    expect(accessions.length).toBeGreaterThanOrEqual(1);
    return accessions[0];
}

/**
 * Complete workflow: submit, release, and get accession for a sequence.
 * @param page The page object
 * @param groupId The group ID
 * @param submissionId The submission ID
 * @param organism The organism key (defaults to 'ebola-sudan')
 * @returns The accession version of the released sequence
 */
export async function submitReleaseAndGetAccession(
    page: Page,
    groupId: number,
    submissionId: string,
    organism: string = 'ebola-sudan',
): Promise<string> {
    await submitAndReleaseSequence(page, groupId, submissionId);
    return getFirstAccessionFromSearch(page, groupId, organism);
}

/**
 * Complete workflow: submit revision and release it.
 * @param page The page object
 * @param groupId The group ID
 * @param originalAccession The accession to revise
 * @param revisedSubmissionId The new submission ID
 * @param sequenceModification String to append to base sequence
 * @param organism The organism key (defaults to 'ebola-sudan')
 */
export async function submitAndReleaseRevision(
    page: Page,
    groupId: number,
    originalAccession: string,
    revisedSubmissionId: string,
    sequenceModification: string,
    organism: string = 'ebola-sudan',
): Promise<void> {
    await submitRevision(
        page,
        groupId,
        originalAccession,
        revisedSubmissionId,
        sequenceModification,
        organism,
    );
    await releaseSequencesAndWaitForIndexing(page, groupId, organism);
}
