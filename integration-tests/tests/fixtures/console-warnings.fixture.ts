import { test as base, ConsoleMessage, expect } from '@playwright/test';

type ConsoleWarningsFixtures = {
    consoleWarnings: string[];
};

export const test = base.extend<ConsoleWarningsFixtures>({
    consoleWarnings: [
        async ({ page, browserName }, use) => {
            const warnings: string[] = [];
            const handleConsole = (msg: ConsoleMessage) => {
                if (msg.type() === 'warning') {
                    const warningText = msg.text();
                    // Filter out known harmless warnings
                    if (
                        !warningText.includes(
                            'Form submission canceled because the form is not connected',
                        )
                    ) {
                        warnings.push(warningText);
                    }
                }
            };
            page.on('console', handleConsole);
            await use(warnings);
            page.off('console', handleConsole);
            // Only assert no warnings for Chrome for now
            if (browserName === 'chromium') {
                expect(warnings).toEqual([]);
            } else {
                console.warn(`Console warnings in ${browserName}: ${warnings.join('\n')}`);
            }
        },
        { auto: true },
    ],
});
