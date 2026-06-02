// Server-only. The `async_hooks` import makes this module unsafe for the client
// bundle. The store is registered on `globalThis` so `config.ts`'s sync helpers
// can read it without importing this file.
import { AsyncLocalStorage } from 'async_hooks';

import type { WebsiteConfig } from './types/config.ts';

export interface RequestConfigContext {
    websiteConfig: WebsiteConfig;
}

declare global {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- intentional well-known globalThis slot
    var __loculusWebsiteConfigStore: AsyncLocalStorage<RequestConfigContext> | undefined;
}

function getStore(): AsyncLocalStorage<RequestConfigContext> {
    globalThis.__loculusWebsiteConfigStore ??= new AsyncLocalStorage<RequestConfigContext>();
    return globalThis.__loculusWebsiteConfigStore;
}

export function withWebsiteConfig<T>(websiteConfig: WebsiteConfig, fn: () => Promise<T>): Promise<T> {
    return getStore().run({ websiteConfig }, fn);
}

export function runWithWebsiteConfigForTests<T>(config: WebsiteConfig, fn: () => T | Promise<T>): Promise<T> {
    return getStore().run({ websiteConfig: config }, async () => fn());
}
