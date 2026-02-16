import { type FC, useState } from 'react';

import { Button } from '../../common/Button';
import IcBaselineDownload from '~icons/ic/baseline-download';
import MaterialSymbolsContentCopyOutline from '~icons/material-symbols/content-copy-outline';

type Props = {
    sequenceName: string;
    sequence: string;
};

export const SequenceActionButtons: FC<Props> = ({ sequenceName, sequence }) => {
    const [copied, setCopied] = useState(false);

    const fastaContent = `>${sequenceName}\n${sequence}`;

    const handleCopy = () => {
        navigator.clipboard
            .writeText(fastaContent)
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            })
            .catch(() => {});
    };

    const handleDownload = () => {
        const blob = new Blob([fastaContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${sequenceName}.fasta`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className='flex items-center gap-1'>
            <Button
                className='btn btn-sm btn-ghost text-gray-600 hover:text-primary-600 hover:bg-gray-100 bg-white/80'
                onClick={handleCopy}
                title='Copy sequence to clipboard'
                data-testid='copy-sequence-button'
            >
                <MaterialSymbolsContentCopyOutline className='h-4 w-4' />
                <span className='ml-1'>{copied ? 'Copied!' : 'Copy'}</span>
            </Button>
            <Button
                className='btn btn-sm btn-ghost text-gray-600 hover:text-primary-600 hover:bg-gray-100 bg-white/80'
                onClick={handleDownload}
                title='Download sequence as FASTA'
                data-testid='download-sequence-button'
            >
                <IcBaselineDownload className='h-4 w-4' />
                <span className='ml-1'>Download</span>
            </Button>
        </div>
    );
};
