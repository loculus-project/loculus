import { test as base, ConsoleMessage, expect } from '@playwright/test';

type ConsoleWarningsFixtures = {
    consoleWarnings: string[];
};

export const test = base.extend<ConsoleWarningsFixtures>({
    consoleWarnings: [
        async ({ page, browserName }, use) => {
            const warnings: string[] = [];
            const handleConsole = (msg: ConsoleMessage) => {
                if (msg.type() === 'warning' || msg.type() === 'error') {
                    const messageText = msg.text();
                    // Filter out known harmless warnings
                    if (
                        !messageText.includes(
                            'Form submission canceled because the form is not connected',
                        )
                    ) {
                        warnings.push(`[${msg.type()}] ${messageText}`);
                    }
                }
            };
            page.on('console', handleConsole);
            await use(warnings);
            page.off('console', handleConsole);
            // Only assert no warnings/errors for Chrome for now
            if (browserName === 'chromium') {
                expect(warnings).toEqual([]);
            } else if (warnings.length > 0) {
                console.warn(`Console warnings/errors in ${browserName}: ${warnings.join('\n')}`);
            }
        },
        { auto: true },
    ],
});
