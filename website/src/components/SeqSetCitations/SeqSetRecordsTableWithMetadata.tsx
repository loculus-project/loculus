import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { type FC, useMemo } from 'react';

import { versionStatuses } from '../../types/lapis';
import type { ClientConfig } from '../../types/runtimeConfig';
import { type SeqSetRecord, SeqSetRecordType } from '../../types/seqSetCitation';

type RecordMetadata = {
    accession: string;
    organism?: string;
    [key: string]: unknown;
};

type FieldToDisplay = {
    field: string;
    displayName: string;
};

type SeqSetRecordsTableWithMetadataProps = {
    seqSetRecords: SeqSetRecord[];
    clientConfig: ClientConfig;
    fieldsToDisplay?: FieldToDisplay[];
    sortByKey?: keyof SeqSetRecord;
    organismDisplayNames?: Record<string, string>;
};

async function queryLapisDetails(
    lapisUrl: string,
    filter: Record<string, unknown>,
    fields: string[],
): Promise<Record<string, unknown>[]> {
    try {
        const response = await axios.post(`${lapisUrl}/sample/details`, {
            ...filter,
            fields,
            dataFormat: 'json',
        });
        const responseData = response.data as { data?: Record<string, unknown>[] } | undefined;
        return responseData?.data ?? [];
    } catch (_error) {
        return [];
    }
}

const fetchRecordsMetadata = async (
    records: SeqSetRecord[],
    clientConfig: ClientConfig,
    fieldsToDisplay: FieldToDisplay[],
): Promise<Map<string, RecordMetadata>> => {
    const accessions = records.map((record) => record.accession);

    if (accessions.length === 0) {
        return new Map();
    }

    // Split accessions into versioned (contain '.') and bare (no '.')
    const versionedAccessions = accessions.filter((acc) => acc.includes('.'));
    const bareAccessions = accessions.filter((acc) => !acc.includes('.'));

    // Extract just the field names for the API request
    const fields = fieldsToDisplay.map((f) => f.field);

    // filter out "organism" as substring in lapisUrls as a hack to remove the dummy organisms
    // #TODO: do this better, in a less hacky way
    // But if we do try to query something that doesn't have the field its no huge problem it will just lead to a console error
    const lapisUrlsWithoutDummies = Object.fromEntries(
        Object.entries(clientConfig.lapisUrls).filter(([organism]) => !organism.includes('organism')),
    );

    const metadataMap = new Map<string, RecordMetadata>();

    // Query all LAPIS instances in parallel
    const lapisPromises = Object.entries(lapisUrlsWithoutDummies).map(async ([organism, lapisUrl]) => {
        const queries: Promise<{ data: Record<string, unknown>[]; keyField: string }>[] = [];

        // Query versioned accessions by accessionVersion
        if (versionedAccessions.length > 0) {
            queries.push(
                queryLapisDetails(
                    lapisUrl,
                    { accessionVersion: versionedAccessions },
                    ['accessionVersion', ...fields],
                ).then((data) => ({ data, keyField: 'accessionVersion' })),
            );
        }

        // Query bare accessions by accession, filtering for the latest version
        if (bareAccessions.length > 0) {
            queries.push(
                queryLapisDetails(
                    lapisUrl,
                    { accession: bareAccessions, versionStatus: versionStatuses.latestVersion },
                    ['accession', ...fields],
                ).then((data) => ({ data, keyField: 'accession' })),
            );
        }

        const results = await Promise.all(queries);
        for (const { data, keyField } of results) {
            for (const record of data) {
                const key = String(record[keyField]);
                const metadata: RecordMetadata = {
                    accession: key,
                    organism,
                };
                for (const field of fields) {
                    metadata[field] = record[field];
                }
                metadataMap.set(key, metadata);
            }
        }
    });

    await Promise.all(lapisPromises);

    return metadataMap;
};

export const SeqSetRecordsTableWithMetadata: FC<SeqSetRecordsTableWithMetadataProps> = ({
    seqSetRecords,
    clientConfig,
    fieldsToDisplay = [
        { field: 'geoLocCountry', displayName: 'Country' },
        { field: 'sampleCollectionDate', displayName: 'Collection date' },
        { field: 'authors', displayName: 'Authors' },
    ],
    sortByKey = 'isFocal',
    organismDisplayNames = {},
}) => {
    const { data: metadataMap, isLoading } = useQuery({
        queryKey: ['seqset-records-metadata', seqSetRecords, clientConfig, fieldsToDisplay],
        queryFn: () => fetchRecordsMetadata(seqSetRecords, clientConfig, fieldsToDisplay),
        staleTime: 5 * 60 * 1000, // 5 minutes
    });

    if (seqSetRecords.length === 0) {
        return null;
    }

    const accessionOutlink = {
        [SeqSetRecordType.loculus]: (acc: string) => `/seq/${acc}`,
    };

    const sortedSeqRecords = useMemo(() => {
        return [...seqSetRecords].sort((a: SeqSetRecord, b: SeqSetRecord) => {
            const x = a[sortByKey];
            const y = b[sortByKey];
            return x > y ? -1 : x < y ? 1 : 0;
        });
    }, [seqSetRecords, sortByKey]);

    return (
        <table className='table-fixed w-full'>
            <thead>
                <tr>
                    <th className='text-left font-medium w-1/6'>Accession</th>
                    <th className='text-left font-medium w-1/4'>Organism</th>
                    <th className='text-left font-medium w-1/6'>Context</th>
                    {fieldsToDisplay.map((fieldConfig) => (
                        <th key={fieldConfig.field} className='text-left font-medium'>
                            {fieldConfig.displayName}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {sortedSeqRecords.map((seqSetRecord, index) => {
                    const metadata = metadataMap?.get(seqSetRecord.accession);
                    const handleRowClick = () => {
                        window.location.href = accessionOutlink[seqSetRecord.type](seqSetRecord.accession);
                    };
                    return (
                        <tr
                            key={`accessionData-${index}`}
                            className='hover:bg-primary-100 border-gray-100 cursor-pointer'
                            onClick={handleRowClick}
                        >
                            <td className='text-left pr-4 truncate max-w-0' title={seqSetRecord.accession}>
                                {seqSetRecord.accession}
                            </td>
                            <td
                                className='text-left pr-4 truncate max-w-0'
                                title={
                                    metadata?.organism
                                        ? (organismDisplayNames[metadata.organism] ?? metadata.organism)
                                        : 'N/A'
                                }
                            >
                                {isLoading ? (
                                    <span className='loading loading-spinner loading-xs'></span>
                                ) : metadata?.organism ? (
                                    (organismDisplayNames[metadata.organism] ?? metadata.organism)
                                ) : (
                                    'N/A'
                                )}
                            </td>
                            <td className='text-left pr-4 truncate max-w-0'>
                                {seqSetRecord.isFocal ? 'Focal' : 'Background'}
                            </td>
                            {fieldsToDisplay.map((fieldConfig) => (
                                <td
                                    key={fieldConfig.field}
                                    className='text-left pr-4 truncate max-w-0'
                                    title={
                                        // eslint-disable-next-line @typescript-eslint/no-base-to-string
                                        String(metadata?.[fieldConfig.field] ?? '')
                                    }
                                >
                                    {isLoading ? (
                                        <span className='loading loading-spinner loading-xs'></span>
                                    ) : (
                                        // eslint-disable-next-line @typescript-eslint/no-base-to-string
                                        String(metadata?.[fieldConfig.field] ?? '')
                                    )}
                                </td>
                            ))}
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};
