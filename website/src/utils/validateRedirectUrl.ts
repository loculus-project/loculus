type RedirectValidation = { valid: true; hostname: string } | { valid: false; error: string };

export function validateRedirectUrl(
    url: string | null | undefined,
    options: { allowInsecure?: boolean; allowedDomains?: string[] | null } = {},
): RedirectValidation {
    if (!url || url.trim() === '') {
        return { valid: false, error: 'No redirect URL provided.' };
    }

    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return { valid: false, error: 'The redirect URL is not a valid URL.' };
    }

    if (parsed.protocol !== 'https:' && !(options.allowInsecure && parsed.protocol === 'http:')) {
        return { valid: false, error: 'The redirect URL must use HTTPS.' };
    }

    const { hostname } = parsed;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        if (!options.allowInsecure) {
            return { valid: false, error: 'The redirect URL must not point to localhost.' };
        }
    }

    if (options.allowedDomains && options.allowedDomains.length > 0) {
        if (!options.allowedDomains.includes(hostname)) {
            return { valid: false, error: `The domain "${hostname}" is not in the list of allowed redirect domains.` };
        }
    }

    return { valid: true, hostname };
}
