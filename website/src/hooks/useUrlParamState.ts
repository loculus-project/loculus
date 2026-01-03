import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';

import type { QueryState } from '../components/SearchPage/useStateSyncedWithUrlQueryParams.ts';
import type { FieldValueUpdate } from '../types/config.ts';

type ParamType = 'string' | 'boolean' | 'nullable-string';

/**
 * A hook that syncs state with URL parameters.
 *
 * @param paramName The name of the URL parameter to sync with
 * @param queryState The current URL query state object
 * @param defaultValue The default value to use if the parameter is not present in the URL
 * @param setSomeFieldValues Function to update field values (resets pagination to page 1)
 * @param paramType Type of the parameter for proper parsing/serialization
 * @param shouldRemove Function to determine if the parameter should be removed from URL
 * @param setState Optional direct state setter to bypass setSomeFieldValues. Use this ONLY for
 *                 UI-only state parameters (like modal open/close) that should NOT reset pagination.
 *                 When provided, updates are applied directly to the URL state without triggering
 *                 pagination reset. Search filter parameters should NOT use this.
 * @returns [value, setValue] tuple similar to useState
 */
function useUrlParamState<T>(
    paramName: string,
    queryState: QueryState,
    defaultValue: T,
    setSomeFieldValues: (...fieldValuesToSet: FieldValueUpdate[]) => void,
    paramType: ParamType = 'string',
    shouldRemove: (value: T) => boolean,
    setState?: Dispatch<SetStateAction<QueryState>>,
): [T, (newValue: T) => void] {
    const valueState = useMemo(
        () => (paramName in queryState ? parseUrlValue(queryState[paramName], paramType) : defaultValue),
        [paramName, queryState, paramType, defaultValue],
    );

    function parseUrlValue(urlValue: string | string[] | undefined, type: ParamType): T {
        switch (type) {
            case 'boolean':
                return (urlValue === 'true') as T;
            case 'nullable-string':
                return (typeof urlValue === 'string' ? urlValue : null) as T;
            case 'string':
                if (Array.isArray(urlValue)) {
                    throw Error('Expected string, found array value in state.');
                }
                return (urlValue ?? '') as T;
        }
    }

    const updateUrlParam = useCallback(
        (newValue: T) => {
            if (setState) {
                // Direct state update without resetting pagination
                setState((prev: QueryState) => {
                    const newState = { ...prev };
                    if (shouldRemove(newValue)) {
                        delete newState[paramName];
                    } else {
                        newState[paramName] = String(newValue);
                    }
                    return newState;
                });
            } else {
                // Use setSomeFieldValues which resets pagination
                setSomeFieldValues([paramName, shouldRemove(newValue) ? null : String(newValue)]);
            }
        },
        [paramName, setSomeFieldValues, shouldRemove, setState],
    );

    return [valueState, updateUrlParam];
}

export default useUrlParamState;
