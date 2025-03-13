import { useCallback, useEffect, useState } from 'react';

type ParamType = 'string' | 'boolean' | 'nullable-string';

/**
 * A hook that syncs state with URL parameters.
 *
 * @param paramName The name of the URL parameter to sync with
 * @param queryState The current URL query state object
 * @param defaultValue The default value to use if the parameter is not present in the URL
 * @param setState Function to update the URL query state
 * @param paramType Type of the parameter for proper parsing/serialization
 * @param shouldRemove Function to determine if the parameter should be removed from URL
 * @returns [value, setValue] tuple similar to useState
 */
function useUrlParamState<T>(
    paramName: string,
    queryState: Record<string, string>,
    defaultValue: T,
    setState: (callback: (prev: Record<string, string>) => Record<string, string>) => void,
    paramType: ParamType = 'string',
    shouldRemove: (value: T) => boolean,
): [T, (newValue: T) => void] {
    const [valueState, setValueState] = useState<T>(
        paramName in queryState ? parseUrlValue(queryState[paramName], paramType) : defaultValue,
    );

    function parseUrlValue(urlValue: string, type: ParamType): T {
        switch (type) {
            case 'boolean':
                return (urlValue === 'true') as unknown as T;
            case 'nullable-string':
                return (urlValue || null) as unknown as T;
            case 'string':
            default:
                return urlValue as unknown as T;
        }
    }

    const updateUrlParam = useCallback(
        (newValue: T) => {
            setState((prev: Record<string, string>) => {
                if (shouldRemove(newValue)) {
                    const newState = { ...prev };
                    delete newState[paramName];
                    return newState;
                } else {
                    return {
                        ...prev,
                        [paramName]: String(newValue),
                    };
                }
            });
        },
        [paramName, setState, shouldRemove],
    );

    const setValue = useCallback(
        (newValue: T) => {
            setValueState(newValue);
            updateUrlParam(newValue);
        },
        [updateUrlParam],
    );

    useEffect(() => {
        const urlValue =
            paramName in queryState ? parseUrlValue(queryState[paramName], paramType) : defaultValue;

        if (JSON.stringify(urlValue) !== JSON.stringify(valueState)) {
            setValueState(urlValue);
        }
    }, [queryState, paramName, paramType, defaultValue, valueState]);

    return [valueState, setValue];
}

export default useUrlParamState;
