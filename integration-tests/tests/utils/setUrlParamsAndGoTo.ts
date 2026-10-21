import { Page } from '@playwright/test';

type UrlParamValue = string | number | boolean;

/**
 * Safe way to add/update URL search params and navigate to the new URL.
 * Should be used in place of `page.goto(page.url() + '?column_submissionId=true');`
 */
export async function setUrlParamsAndGoTo(page: Page, params: Record<string, UrlParamValue>) {
    const url = new URL(page.url());

    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
    }

    await page.goto(url.toString());
}
