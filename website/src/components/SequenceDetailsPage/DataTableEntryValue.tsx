import React, { useEffect, useState } from 'react';
import sanitizeHtml from 'sanitize-html';

import { DataUseTermsHistoryModal } from './DataUseTermsHistoryModal';
import { LinkWithMenuComponent } from './LinkWithMenuComponent';
import { MutationStringContainers, SubstitutionsContainer, SubstitutionsContainers } from './MutationBadge';
import { PlainValueDisplay } from './PlainValueDisplay.tsx';
import { type TableDataEntry } from './types.ts';
import { type DataUseTermsHistoryEntry } from '../../types/backend.ts';
import type { MutationBadgeData } from '../../types/config.ts';

interface Props {
    data: TableDataEntry;
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
    segmentDisplayNameMap?: Record<string, string>;
}

const GroupComponent: React.FC<{ jsonString: string }> = ({ jsonString }) => {
    const values = JSON.parse(jsonString) as TableDataEntry[];
    const groupId = values.find((value) => value.name === 'groupId')?.value;
    const groupName = values.find((value) => value.name === 'groupName')?.value;

    return (
        <a href={`/group/${groupId}`} className='underline'>
            {groupName}
        </a>
    );
};

const HostSpeciesComponent: React.FC<{ jsonString: string }> = ({ jsonString }) => {
    const entries = JSON.parse(jsonString) as TableDataEntry[];

    const hostTaxonId = entries.find((e) => e.name === 'hostTaxonId')?.value.toString();
    const hostNameScientific = entries.find((e) => e.name === 'hostNameScientific')?.value.toString();
    const hostNameCommon = entries.find((e) => e.name === 'hostNameCommon')?.value.toString();

    let displayText: string;
    if (hostNameCommon && hostNameScientific) {
        displayText = `${hostNameCommon} (${hostNameScientific})`;
    } else if (hostNameCommon) {
        displayText = hostNameCommon;
    } else if (hostNameScientific) {
        displayText = hostNameScientific;
    } else if (hostTaxonId) {
        displayText = hostTaxonId;
    } else {
        displayText = '';
    }

    if (hostTaxonId) {
        return (
            <a href={`https://www.ncbi.nlm.nih.gov/taxonomy/${hostTaxonId}`} target='_blank' className='underline'>
                {displayText}
            </a>
        );
    }

    return <>{displayText}</>;
};

const LengthCompletenessComponent: React.FC<{ jsonString: string }> = ({ jsonString }) => {
    const entries = JSON.parse(jsonString) as TableDataEntry[];
    const length = entries.find((e) => e.name.includes('length'))?.value;
    const completeness = entries.find((e) => e.name.includes('completeness'))?.value;

    if (length !== undefined && completeness !== undefined) {
        const completenessPercent = parseFloat((Number(completeness) * 100).toPrecision(3));
        return <>{`${length} (${completenessPercent}%)`}</>;
    }
    return <>{length ?? ''}</>;
};

const GeoLocationComponent: React.FC<{ jsonString: string }> = ({ jsonString }) => {
    const entries = JSON.parse(jsonString) as TableDataEntry[];

    const country = entries.find((e) => e.name === 'geoLocCountry')?.value.toString();
    const admin1 = entries.find((e) => e.name === 'geoLocAdmin1')?.value.toString();
    const admin2 = entries.find((e) => e.name === 'geoLocAdmin2')?.value.toString();

    if (!country) {
        return <>{admin1 ?? admin2 ?? ''}</>;
    }

    const adminParts = [admin2, admin1].filter(Boolean);
    const displayText = adminParts.length > 0 ? `${country} (${adminParts.join(', ')})` : country;

    return <>{displayText}</>;
};

type FileEntry = {
    fileId: string;
    name: string;
    url: string;
};

const FileListComponent: React.FC<{ jsonString: string }> = ({ jsonString }) => {
    const fileEntries = JSON.parse(jsonString) as FileEntry[];

    return (
        <ul>
            {fileEntries.map((fileEntry) => (
                <li key={fileEntry.fileId}>
                    <a href={fileEntry.url} className='underline mr-2'>
                        {fileEntry.name}
                    </a>
                    <FileSizeComponent url={fileEntry.url} />
                </li>
            ))}
        </ul>
    );
};

const FileSizeComponent: React.FC<{ url: string }> = ({ url }) => {
    const [fileSize, setFileSize] = useState<number | null>(null);

    useEffect(() => {
        void fetch(url, { method: 'HEAD', redirect: 'follow' }).then((response) => {
            const contentLength = response.headers.get('Content-Length');
            setFileSize(Number.parseInt(contentLength!));
        });
    }, [url]);

    if (fileSize === null) {
        return <></>;
    }

    return <span className='text-gray-400'>({prettyFormatBytes(fileSize)})</span>;
};

const prettyFormatBytes = (bytes: number): string => {
    if (bytes === 0) {
        return '0 bytes';
    }
    const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1000));
    return (bytes / 1000 ** i).toFixed() + ' ' + sizes[i];
};

export function parseMutation(input: string): MutationBadgeData | null {
    const regex = /^([a-zA-Z0-9]+):([A-Z*-])(\d+)([A-Z*-])$/;
    const match = regex.exec(input);

    if (!match) return null;

    const [, sequenceName, mutationFrom, position, mutationTo] = match;

    return {
        sequenceName,
        mutationFrom,
        position: Number(position),
        mutationTo,
    };
}

export function parseMutations(input: string): MutationBadgeData[] {
    return input
        .trim()
        .split(/\s+/)
        .map(parseMutation)
        .filter((m): m is MutationBadgeData => m !== null);
}

const CustomDisplayComponent: React.FC<Props> = ({ data, dataUseTermsHistory, segmentDisplayNameMap }) => {
    const { value, customDisplay } = data;

    return (
        <div className='whitespace-normal text-gray-600 break-inside-avoid'>
            <div>
                {!customDisplay && <PlainValueDisplay value={value} />}
                {customDisplay?.type === 'percentage' && typeof value === 'number' && `${(100 * value).toFixed(2)}%`}
                {customDisplay?.type === 'badge' &&
                    (customDisplay.badge === undefined || customDisplay.badge.length == 0 ? (
                        <span className='italic'>N/A</span>
                    ) : (
                        <SubstitutionsContainers
                            values={customDisplay.badge}
                            segmentDisplayNameMap={segmentDisplayNameMap}
                        />
                    ))}
                {customDisplay?.type === 'list' &&
                    (customDisplay.list === undefined || customDisplay.list.length == 0 ? (
                        <span className='italic'>N/A</span>
                    ) : (
                        <MutationStringContainers
                            values={customDisplay.list}
                            segmentDisplayNameMap={segmentDisplayNameMap}
                        />
                    ))}
                {customDisplay?.type === 'generatedBadge' &&
                    typeof value === 'string' &&
                    (() => {
                        const mutations = parseMutations(value);
                        if (mutations.length === 0) return null;
                        return <SubstitutionsContainer values={mutations} />;
                    })()}
                {customDisplay?.type === 'link' && customDisplay.url !== undefined && (
                    <a
                        href={customDisplay.url.replace('__value__', value.toString())}
                        target='_blank'
                        className='underline'
                    >
                        {value}
                    </a>
                )}

                {customDisplay?.type === 'linkWithMenu' && customDisplay.linkMenuItems !== undefined && (
                    <LinkWithMenuComponent value={value} linkMenuItems={customDisplay.linkMenuItems} />
                )}
                {customDisplay?.type === 'htmlTemplate' && customDisplay.html !== undefined && (
                    /* eslint-disable @typescript-eslint/naming-convention */
                    <div
                        dangerouslySetInnerHTML={{ __html: generateCleanHtml(customDisplay.html, value.toString()) }}
                    />
                    /* eslint-enable @typescript-eslint/naming-convention */
                )}
                {customDisplay?.type === 'dataUseTerms' && (
                    <>
                        {value} <DataUseTermsHistoryModal dataUseTermsHistory={dataUseTermsHistory} />
                    </>
                )}
                {customDisplay?.type === 'submittingGroup' && typeof value == 'string' && (
                    <GroupComponent jsonString={value} />
                )}
                {customDisplay?.type === 'hostSpecies' && typeof value == 'string' && (
                    <HostSpeciesComponent jsonString={value} />
                )}
                {customDisplay?.type === 'lengthCompleteness' && typeof value == 'string' && (
                    <LengthCompletenessComponent jsonString={value} />
                )}
                {customDisplay?.type === 'geoLocation' && typeof value == 'string' && (
                    <GeoLocationComponent jsonString={value} />
                )}
                {customDisplay?.type === 'fileList' && typeof value == 'string' && (
                    <FileListComponent jsonString={value} />
                )}
            </div>
        </div>
    );
};

const generateCleanHtml = (trustedHtml: string, userValue: string): string => {
    const cleanedValue = sanitizeHtml(userValue, {
        allowedTags: [],
        allowedAttributes: {},
        disallowedTagsMode: 'escape',
    });
    return trustedHtml.replace('__value__', cleanedValue);
};

export default CustomDisplayComponent;
