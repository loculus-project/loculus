import { useCallback, useMemo } from 'react';

import type { ReferenceGenomes } from '../types/referencesGenomes';
import { getSegmentNames, type SegmentReferenceSelections } from './sequenceTypeHelpers';

export function getReferenceIdentifier(identifier: string | undefined, segmentName: string, multipleSegments: boolean) {
    if (identifier === undefined) return undefined;
    return multipleSegments ? `${identifier}_${segmentName}` : identifier;
}

type GetSegmentSelectionsOpts = {
    segments: string[];
    referenceIdentifierField?: string;
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

        result[segmentName] =
            referenceIdentifier === undefined
                ? null
                : ((state[referenceIdentifier] as string | null | undefined) ?? null);
    }

    return result;
}

type UseSelectedReferencesArgs = {
    referenceGenomes: ReferenceGenomes;
    schema: { referenceIdentifierField?: string };
    state: Record<string, unknown>;
};

export function useSelectedReferences({ referenceGenomes, schema, state }: UseSelectedReferencesArgs) {
    const segments = useMemo(() => getSegmentNames(referenceGenomes), [referenceGenomes]);

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
    referenceGenomes,
    schema,
    state,
}: UseSelectedReferencesArgs): SegmentReferenceSelections {
    const segments = Object.keys(referenceGenomes.segmentReferenceGenomes);

    return getSegmentReferenceSelections({
        segments,
        referenceIdentifierField: schema.referenceIdentifierField,
        isMultiSegmented: segments.length > 1,
        state,
    });
}

type UseSetSelectedReferencesArgs = {
    referenceGenomes: ReferenceGenomes;
    schema: { referenceIdentifierField?: string };
    setSomeFieldValues: (entry: [string, string | null]) => void;
};

export function useSetSelectedReferences({
    referenceGenomes,
    schema,
    setSomeFieldValues,
}: UseSetSelectedReferencesArgs) {
    const segments = getSegmentNames(referenceGenomes);
    return useCallback(
        (updates: SegmentReferenceSelections) => {
            Object.entries(updates).forEach(([segmentName, value]) => {
                const identifier = getReferenceIdentifier(
                    schema.referenceIdentifierField,
                    segmentName,
                    segments.length > 1,
                );
                if (identifier === undefined) return;

                setSomeFieldValues([identifier, value]);
            });
        },
        [setSomeFieldValues, segments, schema.referenceIdentifierField],
    );
}
