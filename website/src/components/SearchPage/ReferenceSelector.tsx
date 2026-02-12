import { type FC, useId, useMemo } from 'react';

import type { LapisSearchParameters } from './DownloadDialog/SequenceFilters.tsx';
import { AsyncCombobox } from './fields/AsyncCombobox.tsx';
import { type OptionsProvider } from './fields/AutoCompleteOptions.ts';
import { type ReferenceGenomesInfo } from '../../types/referencesGenomes.ts';
import { getReferenceIdentifier } from '../../utils/referenceSelection.ts';
import { type MetadataFilterSchema } from '../../utils/search.ts';
import { segmentsWithMultipleReferences, type SegmentReferenceSelections } from '../../utils/sequenceTypeHelpers.ts';

type ReferenceSelectorProps = {
    lapisSearchParameters: LapisSearchParameters;
    lapisUrl: string;
    filterSchema: MetadataFilterSchema;
    referenceGenomesInfo: ReferenceGenomesInfo;
    referenceIdentifierField: string;
    selectedReferences: SegmentReferenceSelections;
    setSelectedReferences: (newValues: SegmentReferenceSelections) => void;
};

export const ReferenceSelector: FC<ReferenceSelectorProps> = ({
    lapisSearchParameters,
    lapisUrl,
    filterSchema,
    referenceGenomesInfo,
    referenceIdentifierField,
    selectedReferences,
    setSelectedReferences,
}) => {
    const baseSelectId = useId();

    const multiRefSegments = segmentsWithMultipleReferences(referenceGenomesInfo);
    if (multiRefSegments.length === 0) return null;
    const identifierBySegment = useMemo(() => {
        return multiRefSegments.reduce<Record<string, string | undefined>>((acc, segmentName) => {
            const identifier = getReferenceIdentifier(
                referenceIdentifierField,
                segmentName,
                referenceGenomesInfo.isMultiSegmented,
            );

            acc[segmentName] = identifier;

            return acc;
        }, {});
    }, [referenceIdentifierField, referenceGenomesInfo]);
    const labelsBySegment = useMemo(() => {
        return multiRefSegments.reduce<Record<string, string | undefined>>((acc, segmentName) => {
            const identifier = identifierBySegment[segmentName];

            acc[segmentName] = identifier ? filterSchema.filterNameToLabelMap()[identifier] : undefined;

            return acc;
        }, {});
    }, [filterSchema, referenceIdentifierField, referenceGenomesInfo]);

    const optionsProvidersBySegment = useMemo(() => {
        return multiRefSegments.reduce<Record<string, OptionsProvider>>((acc, segment) => {
            const identifier = identifierBySegment[segment];
            if (!identifier) return acc;

            acc[segment] = {
                type: 'generic' as const,
                lapisUrl,
                lapisSearchParameters,
                fieldName: identifier,
            };

            return acc;
        }, {});
    }, [multiRefSegments, identifierBySegment, lapisUrl, lapisSearchParameters]);

    return (
        <>
            {multiRefSegments.map((segment) => {
                return (
                    <div
                        key={`${baseSelectId}-${segment}`}
                        className='bg-gray-50 border border-gray-300 rounded-md p-3 mb-3'
                    >
                        <label
                            className='block text-xs font-semibold text-gray-700 mb-1'
                            htmlFor={`${baseSelectId}-${segment}`}
                        >
                            {labelsBySegment[segment]}
                        </label>
                        <AsyncCombobox<string>
                            inputId={`${baseSelectId}-${segment}`}
                            value={selectedReferences[segment] ?? ''}
                            onChange={(next) =>
                                setSelectedReferences({
                                    ...selectedReferences,
                                    [segment]: next,
                                })
                            }
                            onClear={() =>
                                setSelectedReferences({
                                    ...selectedReferences,
                                    [segment]: null,
                                })
                            }
                            optionsProvider={optionsProvidersBySegment[segment]}
                            placeholder={`Select ${formatLabel(labelsBySegment[segment] ?? '')}...`}
                            isClearVisible={(val) => (val ?? '') !== ''}
                        />
                        {selectedReferences[segment] == null && (
                            <p className='text-xs text-gray-600 mt-2'>
                                Select a {formatLabel(labelsBySegment[segment] ?? '')} to enable mutation search and
                                download of aligned sequences
                            </p>
                        )}
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
