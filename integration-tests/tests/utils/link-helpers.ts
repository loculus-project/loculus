import { APIRequestContext, Locator, Page, expect } from '@playwright/test';

const LOCAL_TEST_DOMAIN_SUFFIX = '.loculus.test';

function isLocalTestDomain(hostname: string) {
    return hostname === 'loculus.test' || hostname.endsWith(LOCAL_TEST_DOMAIN_SUFFIX);
}

function requestTargetForLocalTestDns(urlString: string, cookieHeader?: string) {
    const url = new URL(urlString);

    if (isLocalTestDomain(url.hostname)) {
        const host = url.host;
        const headers: Record<string, string> = { Host: host };
        url.hostname = '127.0.0.1';
        if (cookieHeader) {
            headers.Cookie = cookieHeader;
        }
        return {
            url: url.toString(),
            headers,
        };
    }

    return { url: urlString };
}

async function requestTargetForPageLocalTestDns(page: Page, urlString: string) {
    const cookies = await page.context().cookies(urlString);
    const cookieHeader = cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
    return requestTargetForLocalTestDns(urlString, cookieHeader);
}

export async function getWithLocalTestDns(request: APIRequestContext, url: string) {
    const requestTarget = requestTargetForLocalTestDns(url);
    return request.get(requestTarget.url, {
        headers: requestTarget.headers,
    });
}

async function getFollowingLocalTestRedirects(page: Page, initialUrl: string) {
    let nextUrl = initialUrl;

    for (let redirectCount = 0; redirectCount < 10; redirectCount++) {
        const requestTarget = await requestTargetForPageLocalTestDns(page, nextUrl);
        const response = await page.request.get(requestTarget.url, {
            headers: requestTarget.headers,
            maxRedirects: 0,
        });

        if (![301, 302, 303, 307, 308].includes(response.status())) {
            return response;
        }

        const location = response.headers().location;
        if (!location) {
            return response;
        }

        nextUrl = new URL(location, nextUrl).toString();
    }

    throw new Error(`Too many redirects while fetching ${initialUrl}`);
}

/**
 * Fetches content from a link's href attribute and asserts it matches expected content
 */
export async function getFromLinkTargetAndAssertContent(
    linkLocator: Locator,
    expectedContent: string,
) {
    await expect(linkLocator).toBeVisible();
    const page = linkLocator.page();
    const href = await linkLocator.getAttribute('href');
    if (!href) {
        throw new Error(`Link locator has no href attribute`);
    }
    const url = href.startsWith('http') ? href : new URL(href, page.url()).toString();
    const response = await getFollowingLocalTestRedirects(page, url);
    expect(response.status()).toBe(200);
    const content = await response.text();
    expect(content).toBe(expectedContent);
}
