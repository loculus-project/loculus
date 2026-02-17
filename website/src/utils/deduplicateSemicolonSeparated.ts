/**
 * Splits a semicolon-separated string, removes duplicate entries (after trimming),
 * and rejoins them with '; '.
 */
export function deduplicateSemicolonSeparated(value: string): string {
    const parts = value.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
    const unique = [...new Set(parts)];
    return unique.join('; ');
}
