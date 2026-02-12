import { useMemo } from 'react';

import { getSegmentNames, type SegmentReferenceSelections } from './sequenceTypeHelpers';
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
};

export type ReferenceSelection =
    | {
          referenceIdentifierField: string;
          selectedReferences: SegmentReferenceSelections;
      }
    | undefined;

export function useReferenceSelection({
    referenceGenomesInfo,
    referenceIdentifierField,
    state,
}: UseReferenceSelectionArgs): ReferenceSelection {
    if (!referenceIdentifierField) {
        return undefined;
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

    return { referenceIdentifierField, selectedReferences };
}
