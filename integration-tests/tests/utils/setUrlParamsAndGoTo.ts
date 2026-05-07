import { Page } from '@playwright/test';

type UrlParamValue = string | number | boolean;

/**
 * Safe way to add/update/remove URL search params and navigate to the new URL. Handles relative URLs correctly.
 * Should be used in place of `page.goto(page.url() + '?column_submissionId=true');`
 */
export async function setUrlParamsAndGoTo(page: Page, params: Record<string, UrlParamValue>) {
    const url = new URL(page.url());

    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) {
            url.searchParams.delete(key);
        } else {
            url.searchParams.set(key, String(value));
        }
    }

    await page.goto(url.toString());
}
