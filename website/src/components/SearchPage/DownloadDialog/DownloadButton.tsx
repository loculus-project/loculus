import { type FC, type MouseEventHandler, useMemo } from 'react';

import { type DownloadOption, generateDownloadUrl } from './generateDownloadUrl.ts';
import { approxMaxAcceptableUrlLength } from '../../../routes/routes.ts';

type DownloadButtonProps = {
    downloadOption: DownloadOption | undefined;
    lapisUrl: string;
    lapisSearchParameters: Record<string, any>;
    disabled?: boolean;
    onClick?: () => void;
};

export const DownloadButton: FC<DownloadButtonProps> = ({
    downloadOption,
    lapisUrl,
    lapisSearchParameters,
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

        const { url, baseUrl, params } = generateDownloadUrl(lapisSearchParameters, downloadOption, lapisUrl);
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
    }, [downloadOption, disabled, lapisSearchParameters, lapisUrl, onClick]);

    return (
        <a
            className={`btn loculusColor ${disabled ? 'btn-disabled' : ''} text-white`}
            href={downloadUrl}
            onClick={handleClick}
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
