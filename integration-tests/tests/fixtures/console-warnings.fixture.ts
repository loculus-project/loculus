import { test as base, ConsoleMessage, expect } from '@playwright/test';

export const test = base.extend({
    page: async ({ page, browserName }, use) => {
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
                    expect(false, `Unexpected console ${msg.type()}: ${messageText}`).toBe(true);
                }
            }
        };
        page.on('console', handleConsole);
        await use(page);
        page.off('console', handleConsole);
    },
});
