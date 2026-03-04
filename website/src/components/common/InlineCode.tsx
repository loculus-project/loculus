import type { ReactNode } from 'react';

/**
 * Renders text with backtick-quoted segments as inline <code> elements.
 * E.g. "Use the `fastaIds` column" becomes: Use the <code>fastaIds</code> column
 */
export const InlineCode = ({ text }: { text: string }): ReactNode => {
    const parts = text.split('`');
    if (parts.length < 3) {
        return text;
    }
    return parts.map((part, i) =>
        i % 2 === 1 ? (
            <code key={i} className='rounded bg-gray-100 px-1 py-0.5 font-mono text-sm text-gray-800'>
                {part}
            </code>
        ) : (
            part
        ),
    );
};
