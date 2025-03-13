import { useCallback, useEffect, useState } from 'react';

/**
 * A hook that syncs state with URL parameters.
 *
 * @param paramName The name of the URL parameter to sync with
 * @param queryState The current URL query state object
 * @param defaultValue The default value to use if the parameter is not present in the URL
 * @param setState Function to update the URL query state
 * @returns [value, setValue] tuple similar to useState
 */
function useUrlParamState<T>(
    paramName: string,
    queryState: Record<string, string>,
    defaultValue: T,
    setState: (callback: (prev: Record<string, string>) => Record<string, string>) => void,
    shouldRemove: (value: T) => boolean,
): [T, (newValue: T) => void] {
    // Initialize state from URL params
    const [valueState, setValueState] = useState<T>(
        paramName in queryState
            ? paramName === 'halfScreen'
                ? ((queryState[paramName] === 'true') as unknown as T)
                : (queryState[paramName] as unknown as T)
            : defaultValue,
    );

    // Create URL update function
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

    // Create combined setter that updates both state and URL
    const setValue = useCallback(
        (newValue: T) => {
            setValueState(newValue);
            updateUrlParam(newValue);
        },
        [updateUrlParam],
    );

    // Sync state from URL when URL params change
    useEffect(() => {
        let urlValue: T;

        if (paramName === 'halfScreen') {
            urlValue = (queryState[paramName] === 'true') as unknown as T;
        } else if (paramName === 'selectedSeq') {
            urlValue = (queryState[paramName] ?? null) as unknown as T;
        } else {
            urlValue = (queryState[paramName] ?? defaultValue) as unknown as T;
        }

        if (JSON.stringify(urlValue) !== JSON.stringify(valueState)) {
            setValueState(urlValue);
        }
    }, [queryState, paramName, defaultValue, valueState]);

    return [valueState, setValue];
}

export default useUrlParamState;
