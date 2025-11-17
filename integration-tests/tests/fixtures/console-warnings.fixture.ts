import { test as base, ConsoleMessage, expect } from '@playwright/test';
import { patchLocatorClick } from '../setup/safe-click';

// Ensure patching is attempted when fixture is loaded
patchLocatorClick();

export const test = base.extend({
    page: async ({ page, browserName }, use) => {
        // Try patching again when page is created (Locator class should be loaded by now)
        patchLocatorClick();

        const handleConsole = (msg: ConsoleMessage) => {
            if (msg.type() === 'warning' || msg.type() === 'error') {
                const messageText = msg.text();

                // Filter out known harmless warnings/errors
                const harmlessMessages = [
                    'Form submission canceled because the form is not connected',
                    'ERR_INCOMPLETE_CHUNKED_ENCODING',
                ];

                const isHarmless = harmlessMessages.some((harmless) =>
                    messageText.includes(harmless),
                );

                if (!isHarmless && browserName === 'chromium') {
                    expect(false, `Unexpected console ${msg.type()}: ${messageText}`).toBe(true);
                }
            }
        };
        page.on('console', handleConsole);
        await use(page);
        page.off('console', handleConsole);
    },
});
