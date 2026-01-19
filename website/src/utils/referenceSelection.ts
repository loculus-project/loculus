import { useCallback, useMemo } from 'react';

import type { ReferenceGenomes } from '../types/referencesGenomes';
import { getSegmentNames, type SegmentReferenceSelections } from './sequenceTypeHelpers';

export function getReferenceIdentifier(identifier: string | undefined, segmentName: string, multipleSegments: boolean) {
    if (identifier === undefined) return undefined;
    return multipleSegments ? `${identifier}_${segmentName}` : identifier;
}

type UseSelectedReferencesArgs = {
    referenceGenomes: ReferenceGenomes;
    schema: { referenceIdentifierField?: string };
    state: Record<string, unknown>;
};

export function useSelectedReferences({ referenceGenomes, schema, state }: UseSelectedReferencesArgs) {
    const segments = useMemo(() => getSegmentNames(referenceGenomes), [referenceGenomes]);

    const selectedReferences = useMemo<SegmentReferenceSelections>(() => {
        const result: SegmentReferenceSelections = {};

        segments.forEach((segmentName) => {
            const referenceIdentifier = getReferenceIdentifier(
                schema.referenceIdentifierField,
                segmentName,
                segments.length > 1,
            );

            result[segmentName] =
                referenceIdentifier === undefined
                    ? null
                    : ((state[referenceIdentifier] as string | null | undefined) ?? null);
        });

        return result;
    }, [segments, state, schema.referenceIdentifierField]);

    return { segments, selectedReferences };
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
