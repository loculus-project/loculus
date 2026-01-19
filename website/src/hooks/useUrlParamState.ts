import { useCallback, useMemo } from 'react';

import type { QueryState } from '../components/SearchPage/useStateSyncedWithUrlQueryParams.ts';
import type { FieldValueUpdate } from '../types/config.ts';

type ParamType = 'string' | 'boolean' | 'nullable-string';

/**
 * A hook that syncs state with URL parameters.
 *
 * @param paramName The name of the URL parameter to sync with
 * @param queryState The current URL query state object
 * @param defaultValue The default value to use if the parameter is not present in the URL
 * @param setSomeFieldValues Function to update field values
 * @param paramType Type of the parameter for proper parsing/serialization
 * @param shouldRemove Function to determine if the parameter should be removed from URL
 * @returns [value, setValue] tuple similar to useState
 */
function useUrlParamState<T>(
    paramName: string,
    queryState: QueryState,
    defaultValue: T,
    setSomeFieldValues: (...fieldValuesToSet: FieldValueUpdate[]) => void,
    paramType: ParamType = 'string',
    shouldRemove: (value: T) => boolean,
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
            setSomeFieldValues([paramName, shouldRemove(newValue) ? null : String(newValue)]);
        },
        [paramName, setSomeFieldValues, shouldRemove],
    );

    return [valueState, updateUrlParam];
}

export default useUrlParamState;
