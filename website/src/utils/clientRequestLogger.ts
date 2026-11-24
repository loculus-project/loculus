import type { Log } from '../clientLogger.ts';

const LOG_ENDPOINT = '/admin/logs.txt';
const FLUSH_INTERVAL_MS = 5000;

let installed = false;

/**
 * Logs every fetch/XHR request made by the browser by observing resource timing entries,
 * and forwards them in batches to the website server, which writes them to its log.
 * Note: resource timing does not expose the HTTP method, and responseStatus is not available in all browsers.
 */
export function installClientRequestLogging() {
    if (installed || typeof PerformanceObserver === 'undefined') {
        return;
    }
    installed = true;

    let buffer: string[] = [];

    new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
            if (entry.initiatorType !== 'fetch' && entry.initiatorType !== 'xmlhttprequest') {
                continue;
            }
            if (entry.name.includes(LOG_ENDPOINT)) {
                continue;
            }
            const status =
                'responseStatus' in entry && typeof entry.responseStatus === 'number' && entry.responseStatus !== 0
                    ? ` -> ${entry.responseStatus}`
                    : '';
            buffer.push(`${entry.initiatorType} ${entry.name}${status} (${Math.round(entry.duration)}ms)`);
        }
    }).observe({ type: 'resource', buffered: true });

    const takeLog = (): Log | undefined => {
        if (buffer.length === 0) {
            return undefined;
        }
        const message = `${window.location.pathname}\n${buffer.join('\n')}`;
        buffer = [];
        return { level: 'info', instance: 'clientRequest', message };
    };

    setInterval(() => {
        const log = takeLog();
        if (log !== undefined) {
            void fetch(LOG_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }, // eslint-disable-line @typescript-eslint/naming-convention -- HTTP header name
                body: JSON.stringify(log),
            });
        }
    }, FLUSH_INTERVAL_MS);

    window.addEventListener('pagehide', () => {
        const log = takeLog();
        if (log !== undefined) {
            navigator.sendBeacon(LOG_ENDPOINT, new Blob([JSON.stringify(log)], { type: 'application/json' }));
        }
    });
}
