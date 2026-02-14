import { useMemo } from 'react';

import { getSegmentNames, type SegmentReferenceSelections } from './sequenceTypeHelpers';
import type { ReferenceGenomesInfo } from '../types/referencesGenomes';

export function getReferenceIdentifier(identifier: string, segmentName: string, multipleSegments: boolean) {
    return multipleSegments ? `${identifier}_${segmentName}` : identifier;
}

export function expectStringOrNull(value: unknown, label: string): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') return value;
    throw new Error(`Expected string or null for ${label}, got ${typeof value}`);
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
        result[segmentName] = expectStringOrNull(state[referenceIdentifier], referenceIdentifier);
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
