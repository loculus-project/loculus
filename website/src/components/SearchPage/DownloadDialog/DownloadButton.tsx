import { type FC, type MouseEvent, type MouseEventHandler, useMemo, useState } from 'react';

import { type DownloadOption, type DownloadUrlGenerator } from './DownloadUrlGenerator.ts';
import type { SequenceFilter } from './SequenceFilters.tsx';
import { approxMaxAcceptableUrlLength } from '../../../routes/routes.ts';
import { Button } from '../../common/Button';
import MaterialSymbolsContentCopyOutline from '~icons/material-symbols/content-copy-outline';

type DownloadButtonProps = {
    downloadUrlGenerator: DownloadUrlGenerator;
    downloadOption: DownloadOption | undefined;
    sequenceFilter: SequenceFilter;
    disabled?: boolean;
    onClick?: () => void;
};

export const CopyUrlButton: FC<{ url: string }> = ({ url }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard
            .writeText(url)
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            })
            .catch(() => {});
    };
    return (
        <Button
            className='ml-2 p-2 text-gray-500 hover:text-primary-600 rounded-md hover:bg-gray-100 transition-colors'
            onClick={handleCopy}
            data-testid='copy-download-url'
            title='Copy download URL'
        >
            <MaterialSymbolsContentCopyOutline className='h-4 w-4' />
            {copied && (
                <span className='absolute bg-gray-800 text-white text-xs px-2 py-1 rounded -mt-10 -ml-2'>Copied!</span>
            )}
        </Button>
    );
};

export const DownloadButton: FC<DownloadButtonProps> = ({
    downloadUrlGenerator,
    downloadOption,
    sequenceFilter,
    disabled = false,
    onClick,
}) => {
    const {
        downloadUrl,
        handleClick,
        isGetRequest,
        message,
    }: {
        downloadUrl: string;
        handleClick: MouseEventHandler<HTMLAnchorElement> | undefined;
        isGetRequest: boolean;
        message?: string;
    } = useMemo(() => {
        if (downloadOption === undefined || disabled) {
            return {
                downloadUrl: '#',
                handleClick: undefined,
                isGetRequest: false,
            };
        }

        const { url, baseUrl, params } = downloadUrlGenerator.generateDownloadUrl(sequenceFilter, downloadOption);
        const useGet = url.length <= approxMaxAcceptableUrlLength;
        if (useGet) {
            return {
                downloadUrl: url,
                handleClick: onClick,
                isGetRequest: true,
            };
        }

        if (
            downloadOption.dataType.type === 'unalignedNucleotideSequences' &&
            downloadOption.dataType.richFastaHeaders.include
        ) {
            return {
                downloadUrl: '#',
                handleClick: undefined,
                isGetRequest: false,
                message: "Sorry, we don't yet support downloading files with custom FASTA headers for long queries.",
            };
        }

        return {
            downloadUrl: '#',
            handleClick: (e: MouseEvent<HTMLAnchorElement>) => {
                e.preventDefault();
                downloadViaPostForm(baseUrl, params);
                if (onClick !== undefined) {
                    onClick();
                }
            },
            isGetRequest: false,
        };
    }, [downloadUrlGenerator, downloadOption, disabled, sequenceFilter, onClick]);

    return (
        <div className='flex items-center'>
            <div className={message && 'tooltip tooltip-open tooltip-right tooltip-info'} data-tip={message}>
                <a
                    className={`btn loculusColor ${disabled || handleClick === undefined ? 'btn-disabled' : ''} text-white`}
                    href={downloadUrl}
                    onClick={handleClick}
                    data-testid='start-download'
                >
                    Download
                </a>
            </div>
            {isGetRequest && !disabled && <CopyUrlButton url={downloadUrl} />}
        </div>
    );
};
const downloadViaPostForm = (baseUrl: string, params: URLSearchParams) => {
    const fieldsParam = params.get('fields');
    if (fieldsParam) {
        params.delete('fields');

        // Split the comma-separated list and add each field individually
        const fieldsList = fieldsParam.split(',');
        fieldsList.forEach((field) => {
            params.append('fields', field.trim());
        });
    }

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = baseUrl;
    form.target = '_blank';

    for (const [key, value] of params.entries()) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
    }

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
};
