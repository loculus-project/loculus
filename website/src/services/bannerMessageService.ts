import axios from 'axios';

import { getWebsiteConfig } from '../config';
import { getInstanceLogger } from '../logger.ts';

const logger = getInstanceLogger('bannerMessageService');

const CACHE_DURATION_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 3000;

interface BannerCache {
    message: string | null;
    lastFetch: number;
}

const bannerCache: BannerCache = { message: null, lastFetch: 0 };
const submissionBannerCache: BannerCache = { message: null, lastFetch: 0 };

async function fetchBannerFromURL(url: string, cache: BannerCache): Promise<string | null> {
    const now = Date.now();
    if (cache.message === null || now - cache.lastFetch > CACHE_DURATION_MS) {
        try {
            const response = await axios.get<string>(url, {
                responseType: 'text',
                timeout: REQUEST_TIMEOUT_MS,
            });
            cache.message = typeof response.data === 'string' ? response.data.trim() : '';
        } catch (e) {
            logger.error(`Failed to fetch banner message from ${url}: ${(e as Error).message}`);
            cache.message = '';
        }
        cache.lastFetch = now;
    }

    return cache.message === '' ? null : cache.message;
}

export async function getRemoteBannerMessage(): Promise<string | null> {
    const { bannerMessageURL } = getWebsiteConfig();

    if (!bannerMessageURL) {
        return null;
    }

    return fetchBannerFromURL(bannerMessageURL, bannerCache);
}

export async function getRemoteSubmissionBannerMessage(): Promise<string | null> {
    const { submissionBannerMessageURL } = getWebsiteConfig();

    if (!submissionBannerMessageURL) {
        return null;
    }

    return fetchBannerFromURL(submissionBannerMessageURL, submissionBannerCache);
}
