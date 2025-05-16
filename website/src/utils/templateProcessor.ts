/**
 * Types for template processing
 */
export type DataType = 'unalignedNucleotideSequences' | 'metadata' | 'alignedNucleotideSequences';

export type PlaceholderMatch = {
    fullMatch: string;
    dataType: string;
    segment?: string;
    richHeaders?: boolean;
    dataFormat?: string;
};

/**
 * Extracts placeholders from a template string
 * Finds placeholders in the format:
 * [type] or [type|format] or [type:segment] or [type:segment|format]
 * or [type+rich] or [type+rich|format] or [type:segment+rich] or [type:segment+rich|format]
 * @param template The template string containing placeholders
 * @returns Map of placeholder keys to match information
 */
export function matchPlaceholders(template: string): PlaceholderMatch[] {
    // Regex to find placeholders in format:
    // [type] or [type|format] or [type:segment] or [type:segment|format]
    // or [type+rich] or [type+rich|format] or [type:segment+rich] or [type:segment+rich|format]
    const placeholderRegex = /\[([\w]+)(?::([\w]+))?(?:\+(rich))?(?:\|([\w]+))?\]/g;
    const matches = Array.from(template.matchAll(placeholderRegex));

    return matches.map((match) => {
        const [fullMatch, dataType, segment, richHeaders, dataFormat] = match;
        return {
            fullMatch: fullMatch,
            dataType: dataType,
            segment: segment,
            richHeaders: richHeaders === 'rich',
            dataFormat: dataFormat,
        };
    });
}

/**
 * Process a URL template by replacing placeholders with values
 */
export function processTemplate(template: string, placeholdersAndValues: Record<string, string>) {
    // Helper function to recursively process {{ }} expressions
    function processNestedBraces(str: string): string {
        // Regex to find innermost {{ }} pairs that don't contain other {{ }}
        const regex = /{{([^{}]+)}}/g;

        // If no more {{ }} found, return the string
        if (!str.match(regex)) {
            return str;
        }

        // Replace all innermost {{ }} with their URL encoded content
        const processed = str.replace(regex, (_match, content: string) => {
            return encodeURIComponent(content);
        });

        // Recursively process any remaining {{ }}
        return processNestedBraces(processed);
    }

    // Replace special placeholders with their values
    let result = template;
    Object.entries(placeholdersAndValues).forEach(([key, value]) => {
        result = result.replace(`[${key}]`, value || '');
    });

    // Process all {{ }} expressions recursively
    return processNestedBraces(result);
}
