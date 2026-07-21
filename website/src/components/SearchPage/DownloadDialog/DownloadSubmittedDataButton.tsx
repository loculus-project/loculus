import { type FC, useState, useCallback } from 'react';
import { toast } from 'react-toastify';

import { type SequenceFilter } from './SequenceFilters';
import { getSubmittedData } from '../../../services/backendClientSideApi';
import { downloadBlob } from '../../../utils/downloadBlob';
import { parseAccessionVersionFromString } from '../../../utils/extractAccessionVersion';
import { formatNumberWithDefaultLocale } from '../../../utils/formatNumber';
import { Button } from '../../common/Button';
import { HoverTooltip } from '../../common/HoverTooltip';

export const MAX_SUBMITTED_DATA_DOWNLOAD_ENTRIES = 500;

type DownloadSubmittedDataButtonProps = {
    sequenceFilter: SequenceFilter;
    backendUrl: string;
    accessToken: string;
    organism: string;
    groupId: number;
    totalSequences?: number;
    fetchAccessions: () => Promise<string[]>;
};

const extractAccessions = (accessionVersions: string[]): string[] => {
    const accessions = accessionVersions.map((av) => parseAccessionVersionFromString(av).accession);
    return [...new Set(accessions)];
};

export const DownloadSubmittedDataButton: FC<DownloadSubmittedDataButtonProps> = ({
    sequenceFilter,
    backendUrl,
    accessToken,
    organism,
    groupId,
    totalSequences,
    fetchAccessions,
}) => {
    const [isDownloading, setIsDownloading] = useState(false);

    const sequenceCount = sequenceFilter.sequenceCount();
    const effectiveCount = sequenceCount ?? totalSequences;
    const exceedsLimit = effectiveCount !== undefined && effectiveCount > MAX_SUBMITTED_DATA_DOWNLOAD_ENTRIES;
    const limitMessage = `Download is limited to ${formatNumberWithDefaultLocale(MAX_SUBMITTED_DATA_DOWNLOAD_ENTRIES)} entries. Please select fewer.`;

    let buttonText: string;
    if (sequenceCount === undefined) {
        const formattedCount = totalSequences !== undefined ? formatNumberWithDefaultLocale(totalSequences) : 'all';
        buttonText = `Download originally submitted data (${formattedCount})`;
    } else {
        const formattedCount = formatNumberWithDefaultLocale(sequenceCount);
        buttonText = `Download originally submitted data (${formattedCount} selected)`;
    }

    const handleDownload = useCallback(async () => {
        setIsDownloading(true);

        try {
            let accessionVersions: string[];

            if (sequenceCount !== undefined) {
                const apiParams = sequenceFilter.toApiParams();
                const selectedVersions = apiParams.accessionVersion;
                if (!Array.isArray(selectedVersions)) {
                    throw new Error('No accessions selected');
                }
                accessionVersions = selectedVersions;
            } else {
                accessionVersions = await fetchAccessions();
            }

            const accessions = extractAccessions(accessionVersions);
            if (accessions.length === 0) {
                throw new Error('No sequences to download');
            }
            if (accessions.length > MAX_SUBMITTED_DATA_DOWNLOAD_ENTRIES) {
                throw new Error(limitMessage);
            }

            const result = await getSubmittedData(backendUrl, organism, accessToken, {
                groupId,
                accessionsFilter: accessions,
            });

            if (!result.ok) {
                throw new Error(
                    `Download failed: ${result.error.status} ${result.error.statusText}. ${result.error.detail}`,
                );
            }

            if (result.blob.size === 0) {
                throw new Error('No data to download');
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `${organism}_submitted_data_${timestamp}.zip`;
            downloadBlob(result.blob, filename);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Download failed';
            toast.error(message, { position: 'top-center', autoClose: 8000 });
        } finally {
            setIsDownloading(false);
        }
    }, [sequenceFilter, backendUrl, accessToken, organism, groupId, sequenceCount, fetchAccessions, limitMessage]);

    const button = (
        <Button variant='outline' onClick={() => void handleDownload()} disabled={isDownloading || exceedsLimit}>
            {isDownloading ? 'Downloading...' : buttonText}
        </Button>
    );

    // The tooltip has to live on a wrapper rather than the button itself: a disabled
    // button is `pointer-events-none`, so it never sees the hover.
    return exceedsLimit ? <HoverTooltip content={limitMessage}>{button}</HoverTooltip> : button;
};
