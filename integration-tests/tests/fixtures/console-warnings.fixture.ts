import { test as base, ConsoleMessage, expect } from '@playwright/test';

export const test = base.extend({
    page: async ({ page, browserName }, use) => {
        const handleConsole = (msg: ConsoleMessage) => {
            if (msg.type() === 'warning' || msg.type() === 'error') {
                const messageText = msg.text();

                // Filter out known harmless warnings/errors
                const harmlessMessages = [
                    'Form submission canceled because the form is not connected',
                    'ERR_INCOMPLETE_CHUNKED_ENCODING',
                    "Response to preflight request doesn't pass access control check", // LAPIS sometimes hangs up preflight requests for unknown reasons
                    'has been externalized for browser compatibility.',
                    "from origin 'http://localhost:3000' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header",
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
