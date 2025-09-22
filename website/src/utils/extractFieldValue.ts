/**
 * Validates that a parameter value is a single value (not an array) and returns it.
 * Throws an error if the value is unexpectedly an array.
 *
 * @param value - The parameter value that might be a string, number, null, or array
 * @param paramName - The name of the parameter (for error messages)
 * @returns The single value, or empty string if null/undefined
 * @throws Error if the value is an array when it shouldn't be
 */
import type { FieldValue } from '../types/config';

export function validateSingleValue(value: FieldValue | undefined, paramName: string): string {
    if (Array.isArray(value)) {
        throw new Error(
            `Parameter "${paramName}" unexpectedly contains multiple values. ` +
                `This parameter does not support multiple values. ` +
                `Values: ${JSON.stringify(value)}`,
        );
    }
    if (value === null || value === undefined) {
        return '';
    }
    return value;
}

/**
 * Extracts an array of values from a field value.
 * If the value is not an array, it wraps it in an array.
 *
 * @param value - The field value
 * @returns An array of values
 */
export function extractArrayValue(value: FieldValue | undefined): (string | null)[] {
    if (value === undefined || value === '') {
        return [];
    }
    if (value === null) {
        // Preserve explicit null selection as [null] for multi-select fields
        return [null];
    }
    if (Array.isArray(value)) {
        return value;
    }
    return [value];
}

/**
 * Normalizes an array that may contain nulls to an array of strings,
 * converting null values to nullQueryValue.
 *
 * @param array - Array that may contain nulls
 * @param nullQueryValue - The string to use for null values
 * @returns Array of strings with nulls converted to nullQueryValue
 */
export function normalizeArrayWithNulls(array: (string | null)[], nullQueryValue: string): string[] {
    return array.map((val) => val ?? nullQueryValue);
}
