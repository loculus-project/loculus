import { type FC, useMemo } from 'react';

import type { LapisSearchParameters } from './DownloadDialog/SequenceFilters.tsx';
import { SingleChoiceAutoCompleteField } from './fields/SingleChoiceAutoCompleteField.tsx';
import type { FieldValues, SetSomeFieldValues } from '../../types/config.ts';
import { type ReferenceGenomesInfo } from '../../types/referencesGenomes.ts';
import { getReferenceIdentifier } from '../../utils/referenceSelection.ts';
import type { MetadataFilterSchema } from '../../utils/search.ts';
import { segmentsWithMultipleReferences } from '../../utils/sequenceTypeHelpers.ts';

type ReferenceSelectorProps = {
    filterSchema: MetadataFilterSchema;
    referenceGenomesInfo: ReferenceGenomesInfo;
    referenceIdentifierField: string;
    fieldValues: FieldValues;
    setSomeFieldValues: SetSomeFieldValues;
    lapisUrl: string;
    lapisSearchParameters: LapisSearchParameters;
    segmentName: string;
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
    segmentName,
}) => {
    const multiRefSegments = segmentsWithMultipleReferences(referenceGenomesInfo);
    if (multiRefSegments.length === 0) return null;
    if (!multiRefSegments.includes(segmentName)) return null;
    const fieldName = useMemo(() => {
        return getReferenceIdentifier(referenceIdentifierField, segmentName, referenceGenomesInfo.isMultiSegmented);
    }, [referenceIdentifierField, segmentName, referenceGenomesInfo.isMultiSegmented]);
    const label = useMemo(() => {
        return fieldName ? filterSchema.filterNameToLabelMap()[fieldName] : undefined;
    }, [filterSchema, referenceIdentifierField]);

    return (
        <div key={segmentName} className='bg-gray-50 border border-gray-300 rounded-md p-3 mb-3'>
            <SingleChoiceAutoCompleteField
                field={{
                    name: fieldName,
                    displayName: label,
                    type: 'string',
                }}
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
                Select a {formatLabel(label ?? '')} to enable mutation search and download of aligned sequences
            </p>
        </div>
    );
};

export const formatLabel = (label: string) => {
    if (label === label.toUpperCase()) {
        return label; // all caps, keep as is
    }
    return label.charAt(0).toLowerCase() + label.slice(1);
};
