import { type FC, type MouseEventHandler, useMemo } from 'react';

import type { DownloadParameters } from './DownloadParameters.tsx';
import { type DownloadOption, generateDownloadUrl } from './generateDownloadUrl.ts';
import { approxMaxAcceptableUrlLength } from '../../../routes/routes.ts';

type DownloadButtonProps = {
    downloadOption: DownloadOption | undefined;
    lapisUrl: string;
    downloadParameters: DownloadParameters;
    disabled?: boolean;
    onClick?: () => void;
};

export const DownloadButton: FC<DownloadButtonProps> = ({
    downloadOption,
    lapisUrl,
    downloadParameters,
    disabled = false,
    onClick,
}) => {
    const {
        downloadUrl,
        handleClick,
    }: {
        downloadUrl: string;
        handleClick: MouseEventHandler<HTMLAnchorElement> | undefined;
    } = useMemo(() => {
        if (downloadOption === undefined || disabled) {
            return {
                downloadUrl: '#',
                handleClick: undefined,
            };
        }

        const { url, baseUrl, params } = generateDownloadUrl(downloadParameters, downloadOption, lapisUrl);
        const useGet = url.length <= approxMaxAcceptableUrlLength;
        if (useGet) {
            return {
                downloadUrl: url,
                handleClick: onClick,
            };
        }

        return {
            downloadUrl: '#',
            handleClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
                e.preventDefault();
                downloadViaPostForm(baseUrl, params);
                if (onClick !== undefined) {
                    onClick();
                }
            },
        };
    }, [downloadOption, disabled, downloadParameters, lapisUrl, onClick]);

    return (
        <a
            className={`btn loculusColor ${disabled ? 'btn-disabled' : ''} text-white`}
            href={downloadUrl}
            onClick={handleClick}
            data-testid='start-download'
        >
            Download
        </a>
    );
};

const downloadViaPostForm = (baseUrl: string, params: URLSearchParams) => {
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
