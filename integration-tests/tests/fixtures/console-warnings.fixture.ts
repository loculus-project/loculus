import { test as base, ConsoleMessage, expect, Page } from '@playwright/test';

type ConsoleWarningsFixtures = {
    pageWithFailOnConsole: Page;
};

export const test = base.extend<ConsoleWarningsFixtures>({
    pageWithFailOnConsole: [
        async ({ page, browserName }, use) => {
            const handleConsole = (msg: ConsoleMessage) => {
                if (msg.type() === 'warning' || msg.type() === 'error') {
                    const messageText = msg.text();
                    // Filter out known harmless warnings
                    if (
                        !messageText.includes(
                            'Form submission canceled because the form is not connected',
                        ) &&
                        browserName === 'chromium'
                    ) {
                        expect(false, `Unexpected console ${msg.type()}: ${messageText}`).toBe(
                            true,
                        );
                    }
                }
            };
            page.on('console', handleConsole);
            await use(page);
            page.off('console', handleConsole);
        },
        { auto: true },
    ],
});
