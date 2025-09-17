/**
 * Parse URLSearchParams into a dictionary that properly handles multiple values.
 * Single parameters become strings, multiple parameters with the same key become arrays.
 *
 * @param searchParams - URLSearchParams to parse
 * @returns Record with string values for single params and string[] for multiple params
 */
export function parseUrlSearchParams(searchParams: URLSearchParams): Record<string, string | string[]> {
    const result: Record<string, string | string[]> = {};
    const allParams = [...searchParams.entries()];

    // Group parameters by key
    const paramGroups: Record<string, string[]> = {};
    for (const [key, value] of allParams) {
        if (!(key in paramGroups)) {
            paramGroups[key] = [];
        }
        paramGroups[key].push(value);
    }

    // Convert to dictionary - single values as strings, multiple as arrays
    for (const [key, values] of Object.entries(paramGroups)) {
        if (values.length === 1) {
            result[key] = values[0];
        } else {
            result[key] = values;
        }
    }

    return result;
}
