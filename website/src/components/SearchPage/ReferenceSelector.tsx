import { type FC, useId, useMemo } from 'react';

import { type ReferenceGenomesMap } from '../../types/referencesGenomes.ts';
import type { MetadataFilterSchema } from '../../utils/search.ts';
import { Button } from '../common/Button.tsx';
import { Select } from '../common/Select.tsx';
import MaterialSymbolsClose from '~icons/material-symbols/close';
import { getIdentifier } from '../../utils/referenceSelection.ts';

type ReferenceSelectorProps = {
    filterSchema: MetadataFilterSchema;
    referenceGenomesMap: ReferenceGenomesMap;
    referenceIdentifierField: string;
    setSelectedReferences: (newValues: Record<string, string | null>) => void;
    selectedReferences: Record<string, string | null>;
};

/**
 * In the multi pathogen case, this is a prominent selector at the top to choose the reference.
 * Choosing a value here is required e.g. to enable mutation search and download of aligned sequences.
 *
 * Does nothing in the single pathogen case.
 */
export const ReferenceSelector: FC<ReferenceSelectorProps> = ({
    filterSchema,
    referenceGenomesMap,
    referenceIdentifierField,
    selectedReferences,
    setSelectedReferences,
}) => {
    const baseSelectId = useId();

    const segments = Object.keys(referenceGenomesMap);

    // Only keep segments that actually need a selector
    const segmentsWithMultipleReferences = segments.filter(
        (segment) => Object.keys(referenceGenomesMap[segment]).length > 1,
    );

    if (segmentsWithMultipleReferences.length === 0) {
        return null;
    }

     const labelsBySegment = useMemo(() => {
        const segments = Object.keys(referenceGenomesMap);

        return segments.reduce<Record<string, string | undefined>>(
            (acc, segmentName) => {
                const identifier = getIdentifier(
                    referenceIdentifierField,
                    segmentName,
                    segments.length > 1 // or `multipleSegments` if you already have it
                );

                acc[segmentName] = identifier
                    ? filterSchema.filterNameToLabelMap()[identifier]
                    : undefined;

                return acc;
            },
            {}
        );
    }, [
        filterSchema,
        referenceIdentifierField,
        referenceGenomesMap
    ]);

    return (
        <>
            {segmentsWithMultipleReferences.map((segment) => {
                const selectId = `${baseSelectId}-${segment}`;

                return (
                    <div
                        key={segment}
                        className='bg-gray-50 border border-gray-300 rounded-md p-3 mb-3'
                    >
                        <label
                            className='block text-xs font-semibold text-gray-700 mb-1'
                            htmlFor={selectId}
                        >
                            {labelsBySegment[segment]} ({segment})
                        </label>

                        <div className='relative'>
                            <Select
                                id={selectId}
                                value={selectedReferences[segment] ?? ''}
                                onChange={(e) =>
                                    setSelectedReferences({
                                        ...selectedReferences,
                                        [segment]: e.target.value,
                                    })
                                }
                                className='w-full px-2 py-1.5 rounded border border-gray-300 text-sm bg-white focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-200'
                            >
                                <option value='' disabled>
                                    Select {formatLabel(labelsBySegment[segment] ?? '')}...
                                </option>

                                {Object.keys(referenceGenomesMap[segment]).map((reference) => (
                                    <option key={reference} value={reference}>
                                        {reference}
                                    </option>
                                ))}
                            </Select>

                            {selectedReferences[segment] != null && (
                                <Button
                                    className='absolute top-2 right-6 flex items-center pr-2 h-5 bg-white rounded-sm'
                                    onClick={() =>
                                        setSelectedReferences({
                                            ...selectedReferences,
                                            [segment]: null,
                                        })
                                    }
                                    aria-label={`Clear ${labelsBySegment[segment] ?? ''}`}
                                    type='button'
                                >
                                    <MaterialSymbolsClose className='w-5 h-5 text-gray-400' />
                                </Button>
                            )}
                        </div>

                        <p className='text-xs text-gray-600 mt-2'>
                            Select a {formatLabel(labelsBySegment[segment] ?? '')} to enable mutation search and download of aligned sequences
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
