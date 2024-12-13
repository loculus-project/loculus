/**
 * Process a URL template by replacing placeholders with values
 */
export function processTemplate(template: string, params: Record<string, string>) {
    // Helper function to recursively process {{ }} expressions
    function processNestedBraces(str: string): string {
        // Regex to find innermost {{ }} pairs that don't contain other {{ }}
        const regex = /{{([^{}]+)}}/g;
        
        // If no more {{ }} found, return the string
        if (!str.match(regex)) {
            return str;
        }
        
        // Replace all innermost {{ }} with their URL encoded content
        const processed = str.replace(regex, (match, content) => {
            return encodeURIComponent(content.trim());
        });
        
        // Recursively process any remaining {{ }}
        return processNestedBraces(processed);
    }
    
    // Replace special placeholders with their values
    let result = template;
    Object.entries(params).forEach(([key, value]) => {
        result = result.replace(`[${key}]`, value || '');
    });
    
    // Process all {{ }} expressions recursively
    return processNestedBraces(result);
}
