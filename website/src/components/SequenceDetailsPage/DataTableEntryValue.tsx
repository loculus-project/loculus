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
            </div>
        </div>
    );
};

const PlainValueDisplay: React.FC<{ value: TableDataEntry['value'] }> = ({ value }) => {
    if (typeof value === 'boolean') {
        return <span>{value ? 'True' : 'False'}</span>;
    }

    if (value !== '') {
        return value;
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
