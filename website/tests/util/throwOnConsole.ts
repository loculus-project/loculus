import { type ConsoleMessage, type Page } from '@playwright/test';

const messagesToIgnore = [
    /Ignoring Event: localhost/, // Playwright specific warning
    /\[vite\] connecting\.\.\./, // Astro dev specific warning
    /\[vite\] connected\./, // Astro dev specific warning
    /\[vite\] ready\./, // Astro dev specific warning
    /Download the React DevTools for a better development experience: https:\/\/reactjs\.org\/link\/react-devtools/, // React info, not an error
    /\[astro-island\] Error hydrating .* TypeError: Importing a module script failed\./, // Fires in `astro dev` mode and only on webkit, related to preview apparently
    /Error while running audit's match function: TypeError: Failed to fetch/, // Astro dev specific
    /downloadable font: kern: Too large subtable/, // firefox only, keycloak only, https://github.com/keycloak/keycloak/issues/29486
    /downloadable font: Table discarded/, // firefox only, keycloak only
    /Target page, context or browser has been closed/, // Playwright specific warning after browser is closed
    /Failed to load resource: net::ERR_INCOMPLETE_CHUNKED_ENCODING/, // network request aborted during tests
];

export function throwOnConsole(page: Page) {
    const listener = (message: ConsoleMessage) => {
        if (messagesToIgnore.some((regex) => regex.test(message.text()))) {
            return;
        }
        if (message.type() !== 'error') {
            return;
        }
        throw new Error(`[${message.type()}]: '${message.text()}'`);
    };

    page.on('console', listener);

    return () => page.removeListener('console', listener);
}
