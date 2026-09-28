import axios, { type AxiosAdapter, type AxiosInstance } from 'axios';

import { createConditionalCacheAdapter, emptyStats, MemoryCacheStore, utf16StringCodec } from './conditionalCache.ts';
import { sendShortLapisRequestsAsGet } from '../lapisGetRequests.ts';

/**
 * Per-tab budget. A search table is 41–82 KB of JSON (≈2× that as UTF-16), so this holds dozens of queries: enough for
 * paging and filter changes back and forth within one page. Every use revalidates with the server.
 */
const BROWSER_CACHE_BYTES = 4 * 1024 * 1024;
const BROWSER_CACHE_MAX_ENTRY_BYTES = 1024 * 1024;

export const browserLapisCacheStats = emptyStats();

let browserAdapter: AxiosAdapter | undefined;
const instances = new Map<string, AxiosInstance>();

function getBrowserAdapter(): AxiosAdapter {
    browserAdapter ??= createConditionalCacheAdapter({
        store: new MemoryCacheStore(BROWSER_CACHE_BYTES, utf16StringCodec, BROWSER_CACHE_MAX_ENTRY_BYTES),
        stats: browserLapisCacheStats,
    });
    return browserAdapter;
}

/**
 * The axios instance for LAPIS calls from the browser. Responses carrying an ETag are kept in a small in-memory LRU
 * shared by all instances of this tab, and every repeat is sent with `If-None-Match`. Outside a browser (SSR render of
 * an island) this is a plain instance. Short queries are sent as GET either way (see `lapisGetRequests.ts`).
 */
export function getLapisAxios(lapisUrl: string): AxiosInstance {
    let instance = instances.get(lapisUrl);
    if (instance === undefined) {
        instance =
            typeof window === 'undefined'
                ? axios.create({ baseURL: lapisUrl })
                : axios.create({ baseURL: lapisUrl, adapter: getBrowserAdapter() });
        sendShortLapisRequestsAsGet(instance);
        instances.set(lapisUrl, instance);
    }
    return instance;
}
