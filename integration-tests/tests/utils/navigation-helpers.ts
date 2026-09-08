import { Page } from '@playwright/test';

export async function waitForUrlReportingAlerts(
    page: Page,
    url: string | RegExp,
    options?: { timeout?: number },
) {
    try {
        await page.waitForURL(url, options);
    } catch (error) {
        const alerts = (
            await page
                .getByRole('alert')
                .allInnerTexts()
                .catch((): string[] => [])
        )
            .map((text) => text.replace(/\s+/g, ' ').trim())
            .filter((text) => text.length > 0);
        if (alerts.length === 0) {
            throw error;
        }
        throw new Error(`Did not navigate to ${url.toString()}: ${alerts.join(' | ')}`);
    }
}
