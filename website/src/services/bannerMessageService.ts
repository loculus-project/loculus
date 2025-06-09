import axios from 'axios';

import { getWebsiteConfig } from '../config';
import { getInstanceLogger } from '../logger.ts';

const logger = getInstanceLogger('bannerMessageService');

let cachedMessage: string | null = null;
let lastFetch = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const REQUEST_TIMEOUT_MS = 3000; // 3 seconds

export async function getBannerMessage(): Promise<string | null> {
    const { bannerMessageURL } = getWebsiteConfig();

    if (!bannerMessageURL) {
        return null;
    }

    const now = Date.now();
    if (cachedMessage === null || now - lastFetch > CACHE_DURATION_MS) {
        try {
            const response = await axios.get<string>(bannerMessageURL, {
                responseType: 'text',
                timeout: REQUEST_TIMEOUT_MS,
            });
            cachedMessage = typeof response.data === 'string' ? response.data : '';
        } catch (e) {
            logger.error(`Failed to fetch banner message from ${bannerMessageURL}: ${(e as Error).message}`);
            cachedMessage = '';
        }
        lastFetch = now;
    }

    return cachedMessage === '' ? null : cachedMessage;
}
