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
    columns?: string[];
};

/**
 * Extracts placeholders from a template string
 * Finds placeholders in the format:
 * [type] or [type|format] or [type:segment] or [type:segment|format]
 * or [type+rich] or [type+rich|format] or [type:segment+rich] or [type:segment+rich|format]
 * For metadata columns, use [metadata+col1,col2].
 * @param template The template string containing placeholders
 * @returns Map of placeholder keys to match information
 */
export function matchPlaceholders(template: string): PlaceholderMatch[] {
    // Regex to find placeholders in format:
    // [type] or [type|format] or [type:segment] or [type:segment|format]
    // or [type+rich] or [type+rich|format] or [type:segment+rich] or [type:segment+rich|format]
    // or [metadata+col1,col2]
    const placeholderRegex = /\[([\w]+)(?::([\w-]+))?(?:\+([^\]|]+))?(?:\|([^\]]+))?\]/g;
    const matches = Array.from(template.matchAll(placeholderRegex));

    return matches.map((match) => {
        const [fullMatch, dataType, segment, plusOption, optionString] = match;

        let dataFormat: string | undefined;
        let columns: string[] | undefined;
        let rich = false;
        if (plusOption) {
            if (dataType === 'metadata') {
                columns = plusOption
                    .split(',')
                    .map((c) => c.trim())
                    .filter((c) => c.length > 0);
            } else if (plusOption === 'rich') {
                rich = true;
            }
        }

        if (optionString) {
            dataFormat = optionString;
        }

        return {
            fullMatch: fullMatch,
            dataType: dataType,
            segment: segment,
            richHeaders: rich,
            dataFormat: dataFormat,
            columns: columns,
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
        result = result.replaceAll(`[${key}]`, value || '');
    });

    // Process all {{ }} expressions recursively
    return processNestedBraces(result);
}
