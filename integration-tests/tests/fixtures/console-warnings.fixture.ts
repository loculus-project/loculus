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
                    'Failed to load resource: the server responded with a status of 401', // Authelia returns 401 on a probe login attempt before tryLoginOrRegister falls back to registration
                    'AxiosError: Request failed with status code 401', // Same 401 surfaced from Authelia's SPA axios wrapper
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
