import { type FC, useEffect, useMemo, useState } from 'react';

import type { FieldValues, SetSomeFieldValues } from '../../../types/config.ts';
import type { SuborganismSegmentAndGeneInfo } from '../../../utils/getSuborganismSegmentAndGeneInfo.tsx';
import DisabledUntilHydrated from '../../DisabledUntilHydrated';

// The minimum length value to filter for segment presence
const MINIMUM_SEGMENT_LENGTH = '1';

interface SegmentPresenceFieldProps {
    suborganismSegmentAndGeneInfo: SuborganismSegmentAndGeneInfo;
    fieldValues: FieldValues;
    setSomeFieldValues: SetSomeFieldValues;
}

export const SegmentPresenceField: FC<SegmentPresenceFieldProps> = ({
    suborganismSegmentAndGeneInfo,
    fieldValues,
    setSomeFieldValues,
}) => {
    const segments = suborganismSegmentAndGeneInfo.nucleotideSegmentInfos;

    // Track which segments are checked based on their length filters
    const checkedSegments = useMemo(() => {
        const checked = new Set<string>();
        segments.forEach((segment) => {
            const lengthFieldName = `${segment.lapisName}LengthFrom`;
            const lengthValue = fieldValues[lengthFieldName];
            // If the lengthFrom field has a value > 0, consider this segment as checked
            if (lengthValue && Number(lengthValue) > 0) {
                checked.add(segment.lapisName);
            }
        });
        return checked;
    }, [segments, fieldValues]);

    const [localCheckedSegments, setLocalCheckedSegments] = useState<Set<string>>(checkedSegments);

    // Update local state when field values change externally
    useEffect(() => {
        setLocalCheckedSegments(checkedSegments);
    }, [checkedSegments]);

    const handleCheckboxChange = (segmentLapisName: string, isChecked: boolean) => {
        const newCheckedSegments = new Set(localCheckedSegments);
        const lengthFieldName = `${segmentLapisName}LengthFrom`;

        if (isChecked) {
            newCheckedSegments.add(segmentLapisName);
            // Set the length filter to require length > 0
            setSomeFieldValues([lengthFieldName, MINIMUM_SEGMENT_LENGTH]);
        } else {
            newCheckedSegments.delete(segmentLapisName);
            // Clear the length filter
            setSomeFieldValues([lengthFieldName, null]);
        }

        setLocalCheckedSegments(newCheckedSegments);
    };

    return (
        <div className='mb-3 p-3 border border-gray-300 rounded-md'>
            <h3 className='text-sm font-medium text-gray-700 mb-2'>Required segments</h3>
            <div className='space-y-2'>
                {segments.map((segment) => (
                    <label key={segment.lapisName} className='flex items-center cursor-pointer'>
                        <DisabledUntilHydrated>
                            <input
                                type='checkbox'
                                checked={localCheckedSegments.has(segment.lapisName)}
                                onChange={(e) => handleCheckboxChange(segment.lapisName, e.target.checked)}
                                className='h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded cursor-pointer'
                            />
                        </DisabledUntilHydrated>
                        <span className='ml-2 text-sm text-gray-700'>{segment.label}</span>
                    </label>
                ))}
            </div>
        </div>
    );
};
