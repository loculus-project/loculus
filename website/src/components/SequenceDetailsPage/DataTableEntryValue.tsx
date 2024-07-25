import React from 'react';

import { DataUseTermsHistoryModal } from './DataUseTermsHistoryModal';
import { SubstitutionsContainers } from './MutationBadge';
import { type TableDataEntry } from './types.ts';
import { type DataUseTermsHistoryEntry } from '../../types/backend.ts';

interface Props {
    data: TableDataEntry;
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
}

const CustomDisplayComponent: React.FC<Props> = ({ data, dataUseTermsHistory }) => {
    const { value, customDisplay } = data;

    return (
        <div className='whitespace-normal text-gray-600 break-inside-avoid'>
            <div className='break-all whitespace-wrap'>
                {!customDisplay && (value !== '' ? value : <span className='italic'>None</span>)}
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
                {customDisplay?.type === 'dataUseTerms' && (
                    <>
                        {value} <DataUseTermsHistoryModal dataUseTermsHistory={dataUseTermsHistory} />
                    </>
                )}
            </div>
        </div>
    );
};

export default CustomDisplayComponent;
