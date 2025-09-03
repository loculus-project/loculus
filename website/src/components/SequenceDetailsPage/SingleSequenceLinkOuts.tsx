import type { FC } from 'react';

import { DownloadUrlGenerator } from '../SearchPage/DownloadDialog/DownloadUrlGenerator.ts';
import { SequenceEntrySelection } from '../SearchPage/DownloadDialog/SequenceFilters.tsx';
import { getLapisUrl } from '../../config.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import type { LinkOut, Schema } from '../../types/config.ts';
import { matchPlaceholders, processTemplate } from '../../utils/templateProcessor.ts';

type Props = {
    organism: string;
    accessionVersion: string;
    clientConfig: ClientConfig;
    schema: Schema;
    linkOuts: LinkOut[];
};

export const SingleSequenceLinkOuts: FC<Props> = ({ organism, accessionVersion, clientConfig, schema, linkOuts }) => {
    const lapisUrl = getLapisUrl(clientConfig, organism);
    const downloadUrlGenerator = new DownloadUrlGenerator(
        organism,
        lapisUrl,
        true,
        schema.richFastaHeaderFields,
    );

    const sequenceFilter = new SequenceEntrySelection(new Set([accessionVersion]));

    const buildUrl = (linkOut: LinkOut) => {
        const placeholders = matchPlaceholders(linkOut.url);

        const urlMap: Record<string, string> = {};
        for (const match of placeholders) {
            const { fullMatch, dataType, segment, richHeaders, dataFormat, columns } = match;
            // Support the same placeholders as search linkouts, but scoped to a single sequence
            if (
                dataType === 'unalignedNucleotideSequences' ||
                dataType === 'alignedNucleotideSequences' ||
                dataType === 'metadata'
            ) {
                const option: any = {
                    includeRestricted: true, // include all by default; no modal on details page
                    dataType: {
                        type: dataType,
                        segment,
                        includeRichFastaHeaders: richHeaders ? true : undefined,
                    },
                    compression: undefined,
                    dataFormat,
                    fields: columns,
                };
                const { url } = downloadUrlGenerator.generateDownloadUrl(sequenceFilter, option);
                urlMap[fullMatch.slice(1, -1)] = url;
            }
        }

        // Additional placeholders for singleSequence linkOuts
        const serverHostFromConfig = (() => {
            try {
                const url = new URL(clientConfig.websiteUrl);
                return url.hostname;
            } catch (_) {
                return undefined;
            }
        })();
        const serverHost =
            serverHostFromConfig ??
            (typeof window !== 'undefined' && (window as any).location ? window.location.hostname : '');
        urlMap['server'] = serverHost;
        urlMap['accessionVersion'] = accessionVersion;
        urlMap['accession'] = accessionVersion.split('.')[0] ?? accessionVersion;

        return processTemplate(linkOut.url, urlMap);
    };

    if (!linkOuts || linkOuts.length === 0) return null;

    return (
        <div className='my-8'>
            <h2 className='text-xl font-bold mb-3'>Tools</h2>
            <div className='flex flex-wrap gap-2'>
                {linkOuts.map((lo) => (
                    <a
                        key={lo.name}
                        className='btn btn-sm'
                        href={buildUrl(lo)}
                        target='_blank'
                        rel='noreferrer noopener'
                    >
                        {lo.name}
                    </a>
                ))}
            </div>
        </div>
    );
};

export default SingleSequenceLinkOuts;
