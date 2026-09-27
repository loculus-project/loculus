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
        const alertText = alerts.length > 0 ? `: ${alerts.join(' | ')}` : '';
        if (error instanceof Error) {
            error.message = `Did not navigate to ${url.toString()}${alertText}\n\n${error.message}`;
        }
        throw error;
    }
}
