import { type FC, useMemo } from 'react';

import type { LapisSearchParameters } from './DownloadDialog/SequenceFilters.tsx';
import { SingleChoiceAutoCompleteField } from './fields/SingleChoiceAutoCompleteField.tsx';
import type { FieldValues, MetadataFilter, SetSomeFieldValues } from '../../types/config.ts';
import { type ReferenceGenomesInfo } from '../../types/referencesGenomes.ts';
import { getReferenceIdentifier } from '../../utils/referenceSelection.ts';
import type { MetadataFilterSchema } from '../../utils/search.ts';
import { getSegmentNames, segmentsWithMultipleReferences } from '../../utils/sequenceTypeHelpers.ts';

type ReferenceSelectorProps = {
    filterSchema: MetadataFilterSchema;
    referenceGenomesInfo: ReferenceGenomesInfo;
    referenceIdentifierField: string;
    fieldValues: FieldValues;
    setSomeFieldValues: SetSomeFieldValues;
    lapisUrl: string;
    lapisSearchParameters: LapisSearchParameters;
};

/**
 * In the multi pathogen case, this is a prominent selector at the top to choose the reference.
 * Choosing a value here is required e.g. to enable mutation search and download of aligned sequences.
 *
 * Does nothing in the single pathogen case.
 */
export const ReferenceSelector: FC<ReferenceSelectorProps> = ({
    filterSchema,
    referenceGenomesInfo,
    referenceIdentifierField,
    fieldValues,
    setSomeFieldValues,
    lapisUrl,
    lapisSearchParameters,
}) => {
    const segments = getSegmentNames(referenceGenomesInfo);
    const multiRefSegments = segmentsWithMultipleReferences(referenceGenomesInfo);

    const fieldInfoBySegment = useMemo(() => {
        return segments.reduce<Record<string, { label: string; fieldName: string }>>((acc, segmentName) => {
            const fieldName = getReferenceIdentifier(
                referenceIdentifierField,
                segmentName,
                referenceGenomesInfo.isMultiSegmented,
            );

            const label = fieldName ? (filterSchema.filterNameToLabelMap()[fieldName] ?? '') : '';

            acc[segmentName] = { label, fieldName };

            return acc;
        }, {});
    }, [filterSchema, referenceIdentifierField, referenceGenomesInfo]);

    if (multiRefSegments.length === 0) {
        return null;
    }

    return (
        <>
            {multiRefSegments.map((segment) => {
                const { label, fieldName } = fieldInfoBySegment[segment];

                const field: MetadataFilter = {
                    name: fieldName,
                    displayName: label,
                    type: 'string',
                };

                return (
                    <div key={segment} className='bg-gray-50 border border-gray-300 rounded-md p-3 mb-3'>
                        <SingleChoiceAutoCompleteField
                            field={field}
                            optionsProvider={{
                                type: 'generic',
                                lapisUrl,
                                lapisSearchParameters,
                                fieldName,
                            }}
                            setSomeFieldValues={setSomeFieldValues}
                            fieldValue={(fieldValues[fieldName] as string | undefined) ?? ''}
                        />

                        <p className='text-xs text-gray-600 mt-2'>
                            Select a {formatLabel(label)} to enable mutation search and download of aligned sequences
                        </p>
                    </div>
                );
            })}
        </>
    );
};

export const formatLabel = (label: string) => {
    if (label === label.toUpperCase()) {
        return label; // all caps, keep as is
    }
    return label.charAt(0).toLowerCase() + label.slice(1);
};
