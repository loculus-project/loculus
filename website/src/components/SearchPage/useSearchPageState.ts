import { useCallback, useMemo } from 'react';

import useStateSyncedWithUrlQueryParams, { type QueryState } from './useStateSyncedWithUrlQueryParams.ts';
import useUrlParamState from '../../hooks/useUrlParamState.ts';
import type { FieldValues, FieldValueUpdate, Schema, SetSomeFieldValues } from '../../types/config.ts';
import { NULL_QUERY_VALUE } from '../../utils/search.ts';

type UseSearchPageStateParams = {
    initialQueryDict: QueryState;
    schema: Schema;
    hiddenFieldValues: FieldValues;
};

export function useSearchPageState({ initialQueryDict, schema, hiddenFieldValues }: UseSearchPageStateParams) {
    const [state, setState] = useStateSyncedWithUrlQueryParams(initialQueryDict);

    const [previewedSeqId, setPreviewedSeqId] = useUrlParamState<string | null>(
        'selectedSeq',
        state,
        null,
        setState,
        'nullable-string',
        (value) => !value,
    );
    const [previewHalfScreen, setPreviewHalfScreen] = useUrlParamState(
        'halfScreen',
        state,
        false,
        setState,
        'boolean',
        (value) => !value,
    );
    const [selectedSuborganism, setSelectedSuborganism] = useUrlParamState<string | null>(
        schema.suborganismIdentifierField ?? '',
        state,
        null,
        setState,
        'nullable-string',
        (value) => value === null,
    );

    const page = parseInt(state.page ?? '1', 10);

    const setPage = useCallback(
        (newPage: number) => {
            setState((prev: QueryState) => {
                if (newPage === 1) {
                    const withoutPageSet = { ...prev };
                    delete withoutPageSet.page;
                    return withoutPageSet;
                } else {
                    return {
                        ...prev,
                        page: newPage.toString(),
                    };
                }
            });
        },
        [setState],
    );

    /**
     * Update field values (query parameters).
     * If value is '' or null, the query parameter is unset.
     * For multi-select fields, we handle fieldValuesToSet as an array where:
     * - If value is an array, it sets multiple values for that field
     * - If value is '' or null, it clears the field
     */
    const setSomeFieldValues: SetSomeFieldValues = useCallback(
        (...fieldValuesToSet: FieldValueUpdate[]) => {
            setState((prev: QueryState) => {
                const newState = { ...prev };
                fieldValuesToSet.forEach(([key, value]) => {
                    if (value === '' || value === null) {
                        if (Object.keys(hiddenFieldValues).includes(key)) {
                            // keep explicitly empty fields because they override the hiddenFieldValues here
                            newState[key] = '';
                        } else {
                            // we can delete keys that are not in the hiddenFieldValues
                            delete newState[key];
                        }
                    } else if (Array.isArray(value)) {
                        // Handle array values for multi-select
                        if (value.length === 0) {
                            delete newState[key];
                        } else {
                            newState[key] = value.map((v) => v ?? NULL_QUERY_VALUE);
                        }
                    } else {
                        newState[key] = value;
                    }
                });
                return newState;
            });
            setPage(1);
        },
        [setState, setPage, hiddenFieldValues],
    );

    const removeFilter = useCallback(
        (metadataFilterName: string) => {
            if (Object.keys(hiddenFieldValues).includes(metadataFilterName)) {
                const hiddenValue = hiddenFieldValues[metadataFilterName];
                // If it's an array with nulls, filter them out (shouldn't happen but TypeScript doesn't know)
                const valueToSet = Array.isArray(hiddenValue)
                    ? hiddenValue.filter((v): v is string => v !== null)
                    : hiddenValue;
                setSomeFieldValues([metadataFilterName, valueToSet]);
            } else {
                setSomeFieldValues([metadataFilterName, null]);
            }
        },
        [setSomeFieldValues, hiddenFieldValues],
    );

    return useMemo(
        () => ({
            state,
            setState,
            previewedSeqId,
            setPreviewedSeqId,
            previewHalfScreen,
            setPreviewHalfScreen,
            selectedSuborganism,
            setSelectedSuborganism,
            page,
            setPage,
            setSomeFieldValues,
            removeFilter,
        }),
        [
            state,
            setState,
            previewedSeqId,
            setPreviewedSeqId,
            previewHalfScreen,
            setPreviewHalfScreen,
            selectedSuborganism,
            setSelectedSuborganism,
            page,
            setPage,
            setSomeFieldValues,
            removeFilter,
        ],
    );
}
