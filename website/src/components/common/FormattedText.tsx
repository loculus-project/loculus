import { Fragment, type ReactNode } from 'react';

/**
 * Renders text with basic inline markdown formatting.
 * Supports: `code` and (optionally) http://links or https://links.
 */
export const FormattedText = ({ text, formatLinks = false }: { text: string; formatLinks?: boolean }): ReactNode => {
    const processLinks = (input: string) => {
        if (!formatLinks || (!input.includes('http://') && !input.includes('https://'))) return input;

        const inputParts = input.split(' ');
        return inputParts
            .map((part, i) => {
                if (part.startsWith('http://') || part.startsWith('https://')) {
                    // Handle common trailing punctuation (.,;:!?)
                    const [url, trailingPunctuation] = part.split(/([.,;:!?]+)$/);
                    return (
                        <Fragment key={i}>
                            <a href={url} className='text-primary-500 px-0.5' target='_blank' rel='noopener noreferrer'>
                                {url}
                            </a>
                            {trailingPunctuation}
                        </Fragment>
                    );
                }
                return part;
            })
            .flatMap((part, i) => (i < inputParts.length - 1 ? [part, ' '] : part));
    };

    const parts = text.split('`');
    if (parts.length < 3) {
        return processLinks(text);
    }
    // Only process matched pairs; if odd number of parts, treat trailing unmatched backtick as plain text
    const pairedLength = parts.length % 2 === 0 ? parts.length - 1 : parts.length;
    return parts.map((part, i) =>
        i % 2 === 1 && i < pairedLength ? (
            <code key={i} className='rounded bg-black/10 px-1 py-0.5 font-mono text-sm'>
                {part}
            </code>
        ) : i >= pairedLength ? (
            <Fragment key={i}>{processLinks('`' + part)}</Fragment>
        ) : (
            <Fragment key={i}>{processLinks(part)}</Fragment>
        ),
    );
};
