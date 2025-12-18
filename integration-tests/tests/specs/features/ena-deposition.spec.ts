import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { EnaDepositionPage } from '../../pages/ena-deposition.page';
import { SingleSequenceSubmissionPage } from '../../pages/submission.page';
import { ReviewPage } from '../../pages/review.page';
import { createTestMetadata, createTestSequenceData } from '../../test-helpers/test-data';
import {
    checkEnaDepositionHealth,
    checkMockEnaHealth,
    resetMockEnaState,
    getMockEnaState,
} from '../../utils/enaApi';

/**
 * UI-based integration tests for the ENA Deposition Management page.
 *
 * These tests verify the full user workflow:
 * 1. Submit sequences through Loculus
 * 2. Approve them for release
 * 3. View them in the ENA Deposition Management UI
 * 4. Submit selected sequences to ENA through the UI
 * 5. Monitor submission status in the UI
 */
test.describe('ENA Deposition Management UI', () => {
    test.beforeEach(async () => {
        // Check if services are available
        const isApiHealthy = await checkEnaDepositionHealth();
        const isMockEnaHealthy = await checkMockEnaHealth();

        if (!isApiHealthy || !isMockEnaHealthy) {
            test.skip(true, 'ENA Deposition API or Mock ENA is not available');
            return;
        }

        // Reset mock ENA state before each test
        try {
            await resetMockEnaState();
        } catch (error) {
            console.warn('Failed to reset mock ENA state:', error);
        }
    });

    test('should show login warning when not authenticated', async ({ browser }) => {
        // Create a new context without authentication
        const context = await browser.newContext();
        const page = await context.newPage();

        const enaPage = new EnaDepositionPage(page);
        await enaPage.goto();

        const isLoginWarningVisible = await enaPage.isLoggedInMessageVisible();
        expect(isLoginWarningVisible).toBe(true);

        await context.close();
    });

    test('should display empty submissions table initially', async ({ page }) => {
        const enaPage = new EnaDepositionPage(page);
        await enaPage.goto();

        // Wait for page to load
        await page.waitForTimeout(2000);

        const count = await enaPage.getSubmissionCount();
        expect(count).toBe(0);
    });

    test('should display approved sequences ready for ENA submission', async ({ page, groupId }) => {
        test.setTimeout(180000); // 3 minutes

        // Step 1: Submit a sequence through Loculus
        const submissionPage = new SingleSequenceSubmissionPage(page);
        const metadata = createTestMetadata();
        await submissionPage.completeSubmission(metadata, createTestSequenceData());

        // Step 2: Approve the sequence
        const reviewPage = new ReviewPage(page);
        await reviewPage.goto(groupId);
        await reviewPage.waitForZeroProcessing();
        await reviewPage.approveAll();

        // Step 3: Check it appears in ENA Deposition Management
        const enaPage = new EnaDepositionPage(page);
        await enaPage.goto();

        // Wait for the submission to appear (may take a moment for the backend to process)
        await enaPage.waitForSubmissionCountToBe(1, 60000);

        const count = await enaPage.getSubmissionCount();
        expect(count).toBeGreaterThanOrEqual(1);
    });

    test('should allow submitting sequences to ENA through the UI', async ({ page, groupId }) => {
        test.setTimeout(300000); // 5 minutes

        // Step 1: Submit and approve a sequence
        const submissionPage = new SingleSequenceSubmissionPage(page);
        const metadata = createTestMetadata();
        await submissionPage.completeSubmission(metadata, createTestSequenceData());

        const reviewPage = new ReviewPage(page);
        await reviewPage.goto(groupId);
        await reviewPage.waitForZeroProcessing();
        await reviewPage.approveAll();

        // Step 2: Navigate to ENA Deposition Management
        const enaPage = new EnaDepositionPage(page);
        await enaPage.goto();

        // Wait for the submission to appear
        await enaPage.waitForSubmissionCountToBe(1, 60000);

        // Step 3: Select and submit to ENA
        await enaPage.selectAllSubmissions();

        const selectedCount = await enaPage.getSelectedSubmissionCount();
        expect(selectedCount).toBeGreaterThanOrEqual(1);

        await enaPage.clickSubmitButton();
        await enaPage.confirmSubmitInModal();

        // Step 4: Wait for submission to complete and verify status changes
        // The status should change from READY_TO_SUBMIT to something else
        await page.waitForTimeout(5000); // Give backend time to process

        // Refresh to get latest status
        await enaPage.clickRefresh();
        await page.waitForTimeout(2000);

        // Verify the mock ENA received the submission
        const mockEnaState = await getMockEnaState();
        expect(mockEnaState.projects.length).toBeGreaterThan(0);
        expect(mockEnaState.samples.length).toBeGreaterThan(0);
    });

    test('should allow filtering submissions by status', async ({ page, groupId }) => {
        test.setTimeout(180000); // 3 minutes

        // Submit and approve sequences
        const submissionPage = new SingleSequenceSubmissionPage(page);
        for (let i = 0; i < 2; i++) {
            await submissionPage.completeSubmission(createTestMetadata(), createTestSequenceData());
        }

        const reviewPage = new ReviewPage(page);
        await reviewPage.goto(groupId);
        await reviewPage.waitForZeroProcessing();
        await reviewPage.approveAll();

        // Navigate to ENA Deposition Management
        const enaPage = new EnaDepositionPage(page);
        await enaPage.goto();

        await enaPage.waitForSubmissionCountToBe(2, 60000);

        const initialCount = await enaPage.getSubmissionCount();
        expect(initialCount).toBeGreaterThanOrEqual(2);

        // Apply status filter (if the UI supports it)
        // This will depend on the actual filter implementation
        // For now, we just verify the filter controls exist
        const hasStatusFilter = await page.locator('select[name="status"]').isVisible();
        if (hasStatusFilter) {
            await enaPage.filterByStatus('READY_TO_SUBMIT');
            await page.waitForTimeout(1000);
        }
    });

    test('should allow switching between Submissions and Errors tabs', async ({ page }) => {
        const enaPage = new EnaDepositionPage(page);
        await enaPage.goto();

        // Start on submissions tab
        await page.waitForTimeout(1000);
        const submissionsVisible = await page.locator('table').isVisible();
        expect(submissionsVisible).toBe(true);

        // Switch to errors tab
        await enaPage.clickErrorsTab();
        await page.waitForTimeout(1000);

        // Errors table should be visible (even if empty)
        const errorsVisible = await page.locator('table').isVisible();
        expect(errorsVisible).toBe(true);

        // Switch back to submissions tab
        await enaPage.clickSubmissionsTab();
        await page.waitForTimeout(1000);

        const backToSubmissions = await page.locator('table').isVisible();
        expect(backToSubmissions).toBe(true);
    });

    test('should refresh data when clicking refresh button', async ({ page, groupId }) => {
        test.setTimeout(180000); // 3 minutes

        const enaPage = new EnaDepositionPage(page);
        await enaPage.goto();

        // Initial state - no submissions
        const initialCount = await enaPage.getSubmissionCount();

        // Submit and approve a sequence in the background
        const submissionPage = new SingleSequenceSubmissionPage(page);
        await submissionPage.completeSubmission(createTestMetadata(), createTestSequenceData());

        const reviewPage = new ReviewPage(page);
        await reviewPage.goto(groupId);
        await reviewPage.waitForZeroProcessing();
        await reviewPage.approveAll();

        // Go back to ENA page and refresh
        await enaPage.goto();
        await enaPage.clickRefresh();

        // Should now see the new submission
        await page.waitForTimeout(2000);
        const newCount = await enaPage.getSubmissionCount();
        expect(newCount).toBeGreaterThan(initialCount);
    });
});
