export function getThemeColor(cssVar: string, fallback = ''): string {
    if (typeof document === 'undefined') return fallback;
    return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
}
