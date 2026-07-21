import { useState, useCallback } from 'react';
import { toast } from 'react-toastify';

import { type SequenceFilter } from './SequenceFilters';
import { getSubmittedData } from '../../../services/backendClientSideApi';
import { downloadBlob } from '../../../utils/downloadBlob';
import { parseAccessionVersionFromString } from '../../../utils/extractAccessionVersion';
import { formatNumberWithDefaultLocale } from '../../../utils/formatNumber';

export const MAX_SUBMITTED_DATA_DOWNLOAD_ENTRIES = 500;

type UseSubmittedDataDownloadProps = {
    sequenceFilter: SequenceFilter;
    backendUrl: string;
    accessToken: string;
    organism: string;
    groupId: number;
    totalSequences?: number;
    fetchAccessions: () => Promise<string[]>;
};

type SubmittedDataDownload = {
    /** Label describing what will be downloaded, including how many entries. */
    label: string;
    isDownloading: boolean;
    /** True when there are more entries than the backend will return in one go. */
    exceedsLimit: boolean;
    /** Explains `exceedsLimit`, for a tooltip on whatever is disabled because of it. */
    limitMessage: string;
    download: () => void;
};

const extractAccessions = (accessionVersions: string[]): string[] => {
    const accessions = accessionVersions.map((av) => parseAccessionVersionFromString(av).accession);
    return [...new Set(accessions)];
};

/**
 * Downloads the files a group originally uploaded, as opposed to the processed data the rest of
 * the download machinery deals in. Editing these and submitting them back is how a bulk revision
 * is made, which is why this is offered alongside the other ways of modifying released entries.
 */
export const useSubmittedDataDownload = ({
    sequenceFilter,
    backendUrl,
    accessToken,
    organism,
    groupId,
    totalSequences,
    fetchAccessions,
}: UseSubmittedDataDownloadProps): SubmittedDataDownload => {
    const [isDownloading, setIsDownloading] = useState(false);

    const sequenceCount = sequenceFilter.sequenceCount();
    const effectiveCount = sequenceCount ?? totalSequences;
    const exceedsLimit = effectiveCount !== undefined && effectiveCount > MAX_SUBMITTED_DATA_DOWNLOAD_ENTRIES;
    const limitMessage = `Download is limited to ${formatNumberWithDefaultLocale(MAX_SUBMITTED_DATA_DOWNLOAD_ENTRIES)} entries. Please select fewer.`;

    let label: string;
    if (sequenceCount === undefined) {
        const formattedCount = totalSequences !== undefined ? formatNumberWithDefaultLocale(totalSequences) : 'all';
        label = `Download ${formattedCount} entries for bulk revision`;
    } else {
        const formattedCount = formatNumberWithDefaultLocale(sequenceCount);
        label = `Download ${formattedCount} selected ${sequenceCount === 1 ? 'entry' : 'entries'} for bulk revision`;
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

    return {
        label,
        isDownloading,
        exceedsLimit,
        limitMessage,
        download: () => void handleDownload(),
    };
};
