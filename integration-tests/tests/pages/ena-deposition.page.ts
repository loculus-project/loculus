import { type Page, expect } from '@playwright/test';

export class EnaDepositionPage {
    constructor(private readonly page: Page) {}

    async goto() {
        await this.page.goto('/ena-deposition');
        await this.waitForPageLoad();
    }

    async waitForPageLoad() {
        // Wait for the main heading to be visible
        await this.page.waitForSelector('h1:has-text("ENA Deposition Management")');
    }

    async isLoggedInMessageVisible(): Promise<boolean> {
        const loginWarning = this.page.locator('text=You must be logged in to manage ENA depositions.');
        return await loginWarning.isVisible();
    }

    // Tab navigation
    async clickSubmissionsTab() {
        await this.page.click('button:has-text("Submissions")');
        await this.page.waitForLoadState('networkidle');
    }

    async clickErrorsTab() {
        await this.page.click('button:has-text("Errors")');
        await this.page.waitForLoadState('networkidle');
    }

    // Submissions table interactions
    async getSubmissionsTableRows() {
        await this.page.waitForSelector('table', { timeout: 10000 });
        return await this.page.locator('tbody tr').all();
    }

    async getSubmissionCount(): Promise<number> {
        const rows = await this.getSubmissionsTableRows();
        return rows.length;
    }

    async waitForSubmissions(count: number, timeout = 30000) {
        await this.page.waitForFunction(
            async (expectedCount) => {
                const rows = document.querySelectorAll('tbody tr');
                return rows.length === expectedCount;
            },
            count,
            { timeout },
        );
    }

    async selectSubmissionByAccession(accessionVersion: string) {
        const row = this.page.locator(`tr:has-text("${accessionVersion}")`);
        await row.locator('input[type="checkbox"]').check();
    }

    async selectAllSubmissions() {
        await this.page.locator('thead input[type="checkbox"]').check();
    }

    async getSelectedSubmissionCount(): Promise<number> {
        const checkboxes = await this.page.locator('tbody input[type="checkbox"]:checked').all();
        return checkboxes.length;
    }

    async clickSubmitButton() {
        await this.page.click('button:has-text("Submit to ENA")');
    }

    async confirmSubmitInModal() {
        // Wait for modal to appear
        await this.page.waitForSelector('[role="dialog"]');
        await this.page.click('button:has-text("Confirm Submit")');
    }

    async waitForSubmissionStatus(accessionVersion: string, status: string, timeout = 60000) {
        await this.page.waitForFunction(
            async ({ accession, expectedStatus }) => {
                const row = document.querySelector(`tr:has-text("${accession}")`);
                if (!row) return false;
                const statusCell = row.querySelector('[data-testid="status-badge"]');
                return statusCell?.textContent?.includes(expectedStatus);
            },
            { accessionVersion, expectedStatus: status },
            { timeout },
        );
    }

    async getSubmissionStatusByAccession(accessionVersion: string): Promise<string | null> {
        const row = this.page.locator(`tr:has-text("${accessionVersion}")`);
        const badge = row.locator('[data-testid="status-badge"]');
        if (!(await badge.isVisible())) {
            return null;
        }
        return await badge.textContent();
    }

    // Filters
    async filterByStatus(status: string) {
        await this.page.selectOption('select[name="status"]', status);
        await this.page.waitForLoadState('networkidle');
    }

    async filterByOrganism(organism: string) {
        await this.page.selectOption('select[name="organism"]', organism);
        await this.page.waitForLoadState('networkidle');
    }

    // Error management
    async getErrorsTableRows() {
        await this.page.waitForSelector('table', { timeout: 10000 });
        return await this.page.locator('tbody tr').all();
    }

    async getErrorCount(): Promise<number> {
        const rows = await this.getErrorsTableRows();
        return rows.length;
    }

    async hasErrorWithMessage(message: string): Promise<boolean> {
        const errorText = await this.page.locator('tbody').textContent();
        return errorText?.includes(message) || false;
    }

    // Pagination
    async clickNextPage() {
        await this.page.click('button:has-text("Next")');
        await this.page.waitForLoadState('networkidle');
    }

    async clickPreviousPage() {
        await this.page.click('button:has-text("Previous")');
        await this.page.waitForLoadState('networkidle');
    }

    // Refresh
    async clickRefresh() {
        await this.page.click('button:has-text("Refresh")');
        await this.page.waitForLoadState('networkidle');
    }

    // Helper to wait for specific number of submissions with retries
    async waitForSubmissionCountToBe(expectedCount: number, timeout = 60000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            await this.clickRefresh();
            await this.page.waitForTimeout(1000);
            const count = await this.getSubmissionCount();
            if (count === expectedCount) {
                return;
            }
            await this.page.waitForTimeout(2000);
        }
        throw new Error(
            `Timeout waiting for ${expectedCount} submissions. Current count: ${await this.getSubmissionCount()}`,
        );
    }
}
