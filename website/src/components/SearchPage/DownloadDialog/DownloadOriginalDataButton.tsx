import { type FC, useState, useCallback } from 'react';

import { type SequenceFilter } from './SequenceFilters';
import { getOriginalData } from '../../../services/backendClientSideApi';
import { downloadBlob } from '../../../utils/downloadBlob';
import { parseAccessionVersionFromString } from '../../../utils/extractAccessionVersion';
import { formatNumberWithDefaultLocale } from '../../../utils/formatNumber';
import { Button } from '../../common/Button';

const MAX_DOWNLOAD_ENTRIES = 500;

type DownloadOriginalDataButtonProps = {
    sequenceFilter: SequenceFilter;
    backendUrl: string;
    accessToken: string;
    organism: string;
    groupId: number;
    totalSequences?: number;
    fetchAccessions: () => Promise<string[]>;
};

export const DownloadOriginalDataButton: FC<DownloadOriginalDataButtonProps> = ({
    sequenceFilter,
    backendUrl,
    accessToken,
    organism,
    groupId,
    totalSequences,
    fetchAccessions,
}) => {
    const [isDownloading, setIsDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const sequenceCount = sequenceFilter.sequenceCount();
    const effectiveCount = sequenceCount ?? totalSequences;
    const exceedsLimit = effectiveCount !== undefined && effectiveCount > MAX_DOWNLOAD_ENTRIES;

    let buttonText: string;
    if (sequenceCount === undefined) {
        const formattedCount = totalSequences !== undefined ? formatNumberWithDefaultLocale(totalSequences) : 'all';
        buttonText = `Download original data (${formattedCount})`;
    } else {
        const formattedCount = formatNumberWithDefaultLocale(sequenceCount);
        buttonText = `Download original data (${formattedCount} selected)`;
    }

    const extractAccessions = (accessionVersions: string[]): string[] => {
        const accessions = accessionVersions.map((av) => parseAccessionVersionFromString(av).accession);
        return [...new Set(accessions)];
    };

    const handleDownload = useCallback(async () => {
        setIsDownloading(true);
        setError(null);

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
                if (accessionVersions.length > MAX_DOWNLOAD_ENTRIES) {
                    throw new Error(
                        `Too many sequences (${accessionVersions.length}). Please filter to ${MAX_DOWNLOAD_ENTRIES} or fewer.`,
                    );
                }
            }

            const accessions = extractAccessions(accessionVersions);
            if (accessions.length === 0) {
                throw new Error('No sequences to download');
            }

            const result = await getOriginalData(backendUrl, organism, accessToken, {
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
            const filename = `${organism}_original_data_${timestamp}.zip`;
            downloadBlob(result.blob, filename);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Download failed';
            setError(message);
        } finally {
            setIsDownloading(false);
        }
    }, [sequenceFilter, backendUrl, accessToken, organism, groupId, sequenceCount, fetchAccessions]);

    const isDisabled = isDownloading || exceedsLimit;

    return (
        <div className='relative'>
            <div className='group relative inline-block'>
                <Button
                    className={`w-[18rem] outlineButton ${exceedsLimit ? 'opacity-50 cursor-not-allowed hover:bg-white hover:text-primary-600' : ''}`}
                    onClick={() => void handleDownload()}
                    disabled={isDisabled}
                >
                    {isDownloading ? 'Downloading...' : buttonText}
                </Button>
                {exceedsLimit && (
                    <div className='invisible group-hover:visible absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 text-sm text-white bg-gray-800 rounded-md shadow-lg whitespace-nowrap z-20'>
                        Limited to {formatNumberWithDefaultLocale(MAX_DOWNLOAD_ENTRIES)} entries. Please select fewer.
                        <div className='absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-gray-800' />
                    </div>
                )}
            </div>
            {error !== null && (
                <div className='absolute top-full left-0 mt-1 text-sm text-red-600 bg-white p-2 rounded shadow-md z-10 max-w-xs'>
                    {error}
                    <Button className='ml-2 text-gray-500 hover:text-gray-700' onClick={() => setError(null)}>
                        x
                    </Button>
                </div>
            )}
        </div>
    );
};
