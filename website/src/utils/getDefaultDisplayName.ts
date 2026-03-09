import { sentenceCase } from 'change-case';

/**
 * Utility function to generate a default display name from a field name.
 * Converts camelCase or snake_case to sentence case.
 *
 * @param fieldName - The original field name (e.g., "pipelineVersion" or "pipeline_version")
 * @returns A human-readable display name (e.g., "Pipeline version")
 */
export function getDefaultDisplayName(fieldName: string): string {
    return sentenceCase(fieldName);
}
