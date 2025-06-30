import React from 'react';
import sanitizeHtml from 'sanitize-html';

import { DataUseTermsHistoryModal } from './DataUseTermsHistoryModal';
import { SubstitutionsContainers } from './MutationBadge';
import { type TableDataEntry } from './types.ts';
import { type DataUseTermsHistoryEntry } from '../../types/backend.ts';

interface Props {
    data: TableDataEntry;
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
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
                    <a href={fileEntry.url} className='underline'>
                        {fileEntry.name}
                    </a>
                </li>
            ))}
        </ul>
    );
};

const CustomDisplayComponent: React.FC<Props> = ({ data, dataUseTermsHistory }) => {
    const { value, customDisplay } = data;

    return (
        <div className='whitespace-normal text-gray-600 break-inside-avoid'>
            <div>
                {!customDisplay && <PlainValueDisplay value={value} />}
                {customDisplay?.type === 'percentage' && typeof value === 'number' && `${(100 * value).toFixed(2)}%`}
                {customDisplay?.type === 'badge' &&
                    (customDisplay.value === undefined ? (
                        <span className='italic'>N/A</span>
                    ) : (
                        <SubstitutionsContainers values={customDisplay.value} />
                    ))}
                {customDisplay?.type === 'link' && customDisplay.url !== undefined && (
                    <a
                        href={customDisplay.url.replace('__value__', value.toString())}
                        target='_blank'
                        className='underline'
                    >
                        {value}
                    </a>
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
                {customDisplay?.type === 'fileList' && typeof value == 'string' && (
                    <FileListComponent jsonString={value} />
                )}
            </div>
        </div>
    );
};

const MAX_PLAIN_STRING_LENGTH = 400;
const SHOW_MORE_LENGTH = 10; // 'Show more' text length

// Preview ends at the last comma or semicolon in the last 50 characters preceding the display limit.
// If there's no comma or semicolon, it will cut off at the last space before the display limit.
// If no space is found, it will cut off at the display limit.
// We reserve 13 characters for the 'Show more' text, so the preview is limited to 387 characters.
const computePreview = (value: string): string => {
    const searchStart = MAX_PLAIN_STRING_LENGTH - 50;
    const searchEnd = MAX_PLAIN_STRING_LENGTH - 3 - SHOW_MORE_LENGTH; // 13 chars reserved

    const commaIndex = Math.max(value.lastIndexOf(',', searchEnd), value.lastIndexOf(';', searchEnd));
    if (commaIndex >= searchStart) {
        return value.slice(0, commaIndex + 1).trim();
    }

    const spaceIndex = value.lastIndexOf(' ', searchEnd);
    if (spaceIndex >= searchStart) {
        return value.slice(0, spaceIndex).trim();
    }

    return value.slice(0, searchEnd).trim();
};

const PlainValueDisplay: React.FC<{ value: TableDataEntry['value'] }> = ({ value }) => {
    const [showMore, setShowMore] = React.useState(false);

    const preview = React.useMemo(() => {
        if (typeof value === 'string' && value.length > MAX_PLAIN_STRING_LENGTH) {
            return computePreview(value);
        }
        return null;
    }, [value]);

    if (typeof value === 'boolean') {
        return <span>{value ? 'True' : 'False'}</span>;
    }

    // If a preview was generated, display the truncated text with a "Show more" button.
    if (preview) {
        return (
            <span>
                {showMore ? value : `${preview}...`}{' '}
                <button onClick={() => setShowMore(!showMore)} className='block'>
                    {showMore ? 'Show less' : 'Show more'}
                </button>
            </span>
        );
    }

    if (value !== '') {
        return <>{value}</>;
    }

    return <span className='italic'>None</span>;
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
