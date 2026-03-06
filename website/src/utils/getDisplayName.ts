import { sentenceCase } from 'change-case';

/**
 * Returns the display name for a field: uses the explicit displayName if present,
 * otherwise generates one from the field name in sentence case.
 *
 * @param field - An object with a `name` and optional `displayName`
 * @returns The display name (e.g., "Pipeline version")
 */
export function getDisplayName(field: { name: string; displayName?: string | undefined }): string {
    return field.displayName ?? sentenceCase(field.name);
}
