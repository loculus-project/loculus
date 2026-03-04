import type { ReactNode } from 'react';

/**
 * Renders text with basic inline markdown formatting.
 * Supports: `code`
 */
export const FormattedText = ({ text }: { text: string }): ReactNode => {
    const parts = text.split('`');
    if (parts.length < 3) {
        return text;
    }
    // Only process matched pairs; if odd number of parts, treat trailing unmatched backtick as plain text
    const pairedLength = parts.length % 2 === 0 ? parts.length - 1 : parts.length;
    return parts.map((part, i) =>
        i % 2 === 1 && i < pairedLength ? (
            <code key={i} className='rounded bg-black/10 px-1 py-0.5 font-mono text-sm'>
                {part}
            </code>
        ) : i >= pairedLength ? (
            '`' + part
        ) : (
            part
        ),
    );
};
