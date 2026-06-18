import { useState } from 'react';

import { Button } from '../common/Button';

interface Props {
    title: string;
    subtitle?: string;
    // Already-formatted strings are used as-is; objects are JSON.stringify'd.
    value: unknown;
}

export function JsonViewer({ title, subtitle, value }: Props) {
    const formatted = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(formatted);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // navigator.clipboard can be unavailable in non-secure contexts
        }
    };

    return (
        <section className='border border-gray-200 rounded'>
            <header className='flex items-center justify-between border-b border-gray-200 px-3 py-2'>
                <div>
                    <h2 className='text-sm font-semibold'>{title}</h2>
                    {subtitle !== undefined && <p className='text-xs text-gray-500'>{subtitle}</p>}
                </div>
                <Button
                    type='button'
                    onClick={() => void copy()}
                    className='text-xs bg-white border border-gray-300 hover:bg-gray-50 px-2 py-1 rounded'
                >
                    {copied ? 'Copied!' : 'Copy'}
                </Button>
            </header>
            <pre className='font-mono text-xs max-h-[60vh] overflow-auto p-3 whitespace-pre'>{formatted}</pre>
        </section>
    );
}
