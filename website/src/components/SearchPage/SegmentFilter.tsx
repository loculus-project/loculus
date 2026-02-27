import { type FC } from 'react';

import type { FieldValues, SetSomeFieldValues } from '../../types/config.ts';
import type { ReferenceGenomesInfo } from '../../types/referencesGenomes.ts';
import type { MetadataFilterSchema } from '../../utils/search.ts';
import { getSegmentNames } from '../../utils/sequenceTypeHelpers.ts';
import DisabledUntilHydrated from '../DisabledUntilHydrated.tsx';

interface SegmentFilterProps {
    referenceGenomesInfo: ReferenceGenomesInfo;
    fieldValues: FieldValues;
    setSomeFieldValues: SetSomeFieldValues;
    filterSchema: MetadataFilterSchema;
}

/**
 * Filter component for multi-segmented organisms that lets users require specific segments
 * to be present by setting the corresponding length filter to > 0.
 */
export const SegmentFilter: FC<SegmentFilterProps> = ({
    referenceGenomesInfo,
    fieldValues,
    setSomeFieldValues,
    filterSchema,
}) => {
    const segmentNames = getSegmentNames(referenceGenomesInfo);

    const ungroupedFilters = filterSchema.ungroupedMetadataFilters();

    // Only show segments that have a length filter field in the schema
    const segmentsWithLengthFields = segmentNames.filter((segmentName) => {
        const lengthFromFieldName = `length_${segmentName}From`;
        return ungroupedFilters.some((f) => f.name === lengthFromFieldName);
    });

    if (segmentsWithLengthFields.length === 0) {
        return null;
    }

    return (
        <div className='mb-3 px-1'>
            <div className='text-sm text-gray-500 mb-1.5'>Required segments</div>
            <div className='flex flex-wrap gap-x-4 gap-y-1.5'>
                {segmentsWithLengthFields.map((segmentName) => {
                    const lengthFromFieldName = `length_${segmentName}From`;
                    const currentValue = fieldValues[lengthFromFieldName];
                    const isChecked =
                        typeof currentValue === 'string' && currentValue !== '' && Number(currentValue) > 0;
                    const displayName = referenceGenomesInfo.segmentDisplayNames[segmentName] ?? segmentName;

                    return (
                        <label key={segmentName} className='flex items-center gap-1.5 cursor-pointer text-sm'>
                            <DisabledUntilHydrated>
                                <input
                                    type='checkbox'
                                    className='h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600 cursor-pointer'
                                    checked={isChecked}
                                    onChange={() => {
                                        setSomeFieldValues([lengthFromFieldName, isChecked ? null : '1']);
                                    }}
                                />
                            </DisabledUntilHydrated>
                            {displayName}
                        </label>
                    );
                })}
            </div>
        </div>
    );
};
