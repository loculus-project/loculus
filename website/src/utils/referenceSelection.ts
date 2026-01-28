import { useCallback, useMemo } from 'react';

import { getSegmentNames, type SegmentReferenceSelections } from './sequenceTypeHelpers';
import type { SetSomeFieldValues } from '../types/config';
import type { ReferenceGenomesInfo } from '../types/referencesGenomes';

export function getReferenceIdentifier(identifier: string, segmentName: string, multipleSegments: boolean) {
    return multipleSegments ? `${identifier}_${segmentName}` : identifier;
}

type GetSegmentSelectionsOpts = {
    segments: string[];
    referenceIdentifierField: string;
    isMultiSegmented: boolean;
    state: Record<string, unknown>;
};

export function getSegmentReferenceSelections({
    segments,
    referenceIdentifierField,
    isMultiSegmented,
    state,
}: GetSegmentSelectionsOpts): SegmentReferenceSelections {
    const result: SegmentReferenceSelections = {};

    for (const segmentName of segments) {
        const referenceIdentifier = getReferenceIdentifier(referenceIdentifierField, segmentName, isMultiSegmented);
        // TODO(5891): it would be better to avoid this typecast
        result[segmentName] = (state[referenceIdentifier] as string | null | undefined) ?? null;
    }

    return result;
}

type UseSelectedReferencesArgs = {
    referenceGenomesInfo: ReferenceGenomesInfo;
    schema: { referenceIdentifierField: string };
    state: Record<string, unknown>;
};

export function useSelectedReferences({ referenceGenomesInfo, schema, state }: UseSelectedReferencesArgs) {
    const segments = useMemo(() => getSegmentNames(referenceGenomesInfo), [referenceGenomesInfo]);

    return useMemo(
        () =>
            getSegmentReferenceSelections({
                segments,
                referenceIdentifierField: schema.referenceIdentifierField,
                isMultiSegmented: segments.length > 1,
                state,
            }),
        [segments, schema.referenceIdentifierField, state],
    );
}

export function getSelectedReferences({
    referenceGenomesInfo,
    schema,
    state,
}: UseSelectedReferencesArgs): SegmentReferenceSelections {
    const segments = Object.keys(referenceGenomesInfo.segmentReferenceGenomes);

    return getSegmentReferenceSelections({
        segments,
        referenceIdentifierField: schema.referenceIdentifierField,
        isMultiSegmented: segments.length > 1,
        state,
    });
}

type UseSetSelectedReferencesArgs = {
    referenceGenomesInfo: ReferenceGenomesInfo;
    schema: { referenceIdentifierField: string };
    setSomeFieldValues: SetSomeFieldValues;
};

export function useSetSelectedReferences({
    referenceGenomesInfo,
    schema,
    setSomeFieldValues,
}: UseSetSelectedReferencesArgs) {
    const segments = getSegmentNames(referenceGenomesInfo);
    return useCallback(
        (updates: SegmentReferenceSelections) => {
            Object.entries(updates).forEach(([segmentName, value]) => {
                const identifier = getReferenceIdentifier(
                    schema.referenceIdentifierField,
                    segmentName,
                    segments.length > 1,
                );

                setSomeFieldValues([identifier, value]);
            });
        },
        [setSomeFieldValues, segments, schema.referenceIdentifierField],
    );
}
