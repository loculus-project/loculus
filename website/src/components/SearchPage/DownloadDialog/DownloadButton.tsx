import { type FC, useMemo, useState } from 'react';

import { type DownloadOption, type DownloadUrlGenerator } from './DownloadUrlGenerator.ts';
import type { SequenceFilter } from './SequenceFilters.tsx';
import { approxMaxAcceptableUrlLength } from '../../../routes/routes.ts';
import { createAuthorizationHeader } from '../../../utils/createAuthorizationHeader.ts';
import { stringifyMaybeAxiosError } from '../../../utils/stringifyMaybeAxiosError.ts';
import { Button } from '../../common/Button';
import { HoverTooltip } from '../../common/HoverTooltip';
import MaterialSymbolsContentCopyOutline from '~icons/material-symbols/content-copy-outline';

type DownloadButtonProps = {
    downloadUrlGenerator: DownloadUrlGenerator;
    downloadOption: DownloadOption | undefined;
    sequenceFilter: SequenceFilter;
    /**
     * The logged-in user's access token. Attached as `Authorization: Bearer ...` header to the
     * LAPIS download request (required when the deployment enables LAPIS authentication;
     * browser navigation cannot attach headers, so the download is fetched programmatically).
     */
    accessToken?: string;
    disabled?: boolean;
    onClick?: () => void;
};

const CopyUrlButton: FC<{ url: string }> = ({ url }) => {
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
                <span className='absolute bg-gray-800 text-white text-xs px-2 py-1 rounded-sm -mt-10 -ml-2'>
                    Copied!
                </span>
            )}
        </Button>
    );
};

function filenameFromContentDisposition(header: string | null, fallback: string): string {
    if (header === null) {
        return fallback;
    }
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
    if (match === null) {
        return fallback;
    }
    try {
        return decodeURIComponent(match[1]);
    } catch {
        return match[1];
    }
}

/**
 * LAPIS expects repeated `fields` parameters on form-encoded POST bodies (not one
 * comma-separated value), mirroring what the previous hidden-form submission produced.
 */
function withSplitFieldsParam(params: URLSearchParams): URLSearchParams {
    const fieldsParam = params.get('fields');
    if (fieldsParam !== null) {
        params.delete('fields');
        fieldsParam.split(',').forEach((field) => params.append('fields', field.trim()));
    }
    return params;
}

export const DownloadButton: FC<DownloadButtonProps> = ({
    downloadUrlGenerator,
    downloadOption,
    sequenceFilter,
    accessToken,
    disabled = false,
    onClick,
}) => {
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState<string | undefined>(undefined);

    const { downloadUrl, unsupportedLongQueryWithRichFastaHeaders } = useMemo(() => {
        if (downloadOption === undefined) {
            return { downloadUrl: undefined, unsupportedLongQueryWithRichFastaHeaders: false };
        }
        const { url } = downloadUrlGenerator.generateDownloadUrl(sequenceFilter, downloadOption);
        return {
            downloadUrl: url,
            unsupportedLongQueryWithRichFastaHeaders:
                url.length > approxMaxAcceptableUrlLength &&
                downloadOption.dataType.type === 'unalignedNucleotideSequences' &&
                downloadOption.dataType.richFastaHeaders.include,
        };
    }, [downloadUrlGenerator, downloadOption, sequenceFilter]);

    const startDownload = async () => {
        if (downloadOption === undefined) {
            return;
        }
        setDownloadError(undefined);
        setIsDownloading(true);
        try {
            const { url, baseUrl, params } = downloadUrlGenerator.generateDownloadUrl(sequenceFilter, downloadOption);
            const useGet = url.length <= approxMaxAcceptableUrlLength;
            const response = await fetch(useGet ? url : baseUrl, {
                ...(useGet ? {} : { method: 'POST', body: withSplitFieldsParam(params) }),
                headers: createAuthorizationHeader(accessToken),
            });
            if (!response.ok) {
                throw new Error(`LAPIS answered with status ${response.status}`);
            }
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = objectUrl;
            anchor.download = filenameFromContentDisposition(
                response.headers.get('Content-Disposition'),
                params.get('downloadFileBasename') ?? 'download',
            );
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(objectUrl);
            if (onClick !== undefined) {
                onClick();
            }
        } catch (error) {
            setDownloadError(stringifyMaybeAxiosError(error));
        } finally {
            setIsDownloading(false);
        }
    };

    const message = unsupportedLongQueryWithRichFastaHeaders
        ? "Sorry, we don't yet support downloading files with custom FASTA headers for long queries."
        : downloadError !== undefined
          ? `Download failed: ${downloadError}`
          : undefined;

    const isDisabled = disabled || downloadOption === undefined || isDownloading;

    const downloadAnchor = (
        <Button
            as='button'
            variant={isDisabled ? 'unstyled' : 'primary'}
            disabled={isDisabled || undefined}
            onClick={() => void startDownload()}
            data-testid='start-download'
            data-download-url={downloadUrl}
        >
            {isDownloading ? 'Downloading...' : 'Download'}
        </Button>
    );

    return (
        <div className='flex items-center'>
            {message !== undefined ? (
                <HoverTooltip content={message} place='right' alwaysOpen>
                    {downloadAnchor}
                </HoverTooltip>
            ) : (
                <div>{downloadAnchor}</div>
            )}
            {downloadUrl !== undefined &&
                !disabled &&
                !isDownloading &&
                downloadError === undefined &&
                !unsupportedLongQueryWithRichFastaHeaders &&
                downloadUrl.length <= approxMaxAcceptableUrlLength && <CopyUrlButton url={downloadUrl} />}
        </div>
    );
};
