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

type GetSelectedReferencesArgs = {
    referenceGenomesInfo: ReferenceGenomesInfo;
    referenceIdentifierField: string;
    state: Record<string, unknown>;
};

export function getSelectedReferences({
    referenceGenomesInfo,
    referenceIdentifierField,
    state,
}: GetSelectedReferencesArgs): SegmentReferenceSelections {
    const segments = Object.keys(referenceGenomesInfo.segmentReferenceGenomes);

    return getSegmentReferenceSelections({
        segments,
        referenceIdentifierField,
        isMultiSegmented: segments.length > 1,
        state,
    });
}

type UseReferenceSelectionArgs = {
    referenceGenomesInfo: ReferenceGenomesInfo;
    referenceIdentifierField: string | undefined;
    state: Record<string, unknown>;
    setSomeFieldValues: SetSomeFieldValues;
};

export type ReferenceSelectionResult =
    | {
          referenceIdentifierField: string;
          selectedReferences: SegmentReferenceSelections;
          setSelectedReferences: (selections: SegmentReferenceSelections) => void;
      }
    | {
          referenceIdentifierField: undefined;
          selectedReferences: undefined;
          setSelectedReferences: undefined;
      };

export function useReferenceSelection({
    referenceGenomesInfo,
    referenceIdentifierField,
    state,
    setSomeFieldValues,
}: UseReferenceSelectionArgs): ReferenceSelectionResult {
    if (!referenceIdentifierField) {
        return { referenceIdentifierField: undefined, selectedReferences: undefined, setSelectedReferences: undefined };
    }

    const segments = useMemo(() => getSegmentNames(referenceGenomesInfo), [referenceGenomesInfo]);

    const selectedReferences = useMemo(
        () =>
            getSegmentReferenceSelections({
                segments,
                referenceIdentifierField,
                isMultiSegmented: segments.length > 1,
                state,
            }),
        [segments, referenceIdentifierField, state],
    );

    const setSelectedReferences = useCallback(
        (updates: SegmentReferenceSelections) => {
            Object.entries(updates).forEach(([segmentName, value]) => {
                const identifier = getReferenceIdentifier(referenceIdentifierField, segmentName, segments.length > 1);
                setSomeFieldValues([identifier, value]);
            });
        },
        [setSomeFieldValues, segments, referenceIdentifierField],
    );

    return { referenceIdentifierField, selectedReferences, setSelectedReferences };
}
