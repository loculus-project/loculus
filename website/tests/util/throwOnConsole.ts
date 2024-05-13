import { type ConsoleMessage, type Page } from '@playwright/test';

const messagesToIgnore = [
    /Ignoring Event: localhost/,
    /\[vite\] connecting\.\.\./,
    /\[vite\] connected\./,
    /\[vite\] ready\./,
    /Download the React DevTools for a better development experience: https:\/\/reactjs\.org\/link\/react-devtools/,
    /\[astro-island\] Error hydrating .* TypeError: Importing a module script failed\./, // Fires in `astro dev` mode only
    /downloadable font: kern: Too large subtable/,
    /downloadable font: Table discarded/,
    /Target page, context or browser has been closed/,
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
