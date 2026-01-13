import { useCallback, useMemo } from "react";

export function getIdentifier(
  identifier: string | undefined,
  segmentName: string,
  multipleSegments: boolean
) {
  if (identifier === undefined) return undefined;
  return multipleSegments ? `${identifier}-${segmentName}` : identifier;
}

export function useSegments(referenceGenomesMap: Record<string, unknown>) {
  return useMemo(() => Object.keys(referenceGenomesMap), [referenceGenomesMap]);
}

type UseSelectedReferencesArgs = {
  referenceGenomesMap: Record<string, unknown>;
  schema: { referenceIdentifierField?: string };
  state: Record<string, unknown>;
};

export function useSelectedReferences({
  referenceGenomesMap,
  schema,
  state,
}: UseSelectedReferencesArgs) {
  const segments = useSegments(referenceGenomesMap);

  const selectedReferences = useMemo<Record<string, string | null>>(() => {
    const result: Record<string, string | null> = {};

    segments.forEach((segmentName) => {
      const referenceIdentifier = getIdentifier(
        schema.referenceIdentifierField,
        segmentName,
        segments.length > 1
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
  referenceGenomesMap: Record<string, unknown>;
  schema: { referenceIdentifierField?: string };
  setSomeFieldValues: (entry: [string, string | null]) => void;
};

export function useSetSelectedReferences({
  referenceGenomesMap,
  schema,
  setSomeFieldValues,
}: UseSetSelectedReferencesArgs) {
  const segments = useSegments(referenceGenomesMap);

  return useCallback(
    (updates: Record<string, string | null>) => {
      Object.entries(updates).forEach(([segmentName, value]) => {
        const identifier = getIdentifier(
          schema.referenceIdentifierField,
          segmentName,
          segments.length > 1
        );
        if (identifier === undefined) return;

        setSomeFieldValues([identifier, value]);
      });
    },
    [setSomeFieldValues, segments, schema.referenceIdentifierField]
  );
}
