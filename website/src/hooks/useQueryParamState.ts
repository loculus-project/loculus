import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

interface QueryState {
  [key: string]: string;
}

/**
 * A custom hook that manages both local state and URL query parameter state,
 * removing the parameter from the URL when the value matches the default value.
 * 
 * This hook simplifies the common pattern of managing both local state and URL query parameters
 * where we want to remove the parameter entirely when it's set to a default value.
 * 
 * @param setState The setState function from useQueryAsState
 * @param paramName The query parameter name
 * @param initialValue Initial value for the state
 * @param defaultValue The default value (when this value is set, the parameter is removed from URL)
 * @param transform Optional function to transform value before setting in URL
 * @returns A tuple containing the current state value and a setter function
 * 
 * @example
 * // Half screen state with boolean value
 * const [previewHalfScreen, setPreviewHalfScreen] = useQueryParamState(
 *   setState,
 *   'halfScreen',
 *   state.halfScreen === 'true',
 *   false,
 *   (value) => value ? 'true' : 'false'
 * );
 * 
 * // Page state with numeric value
 * const [page, setPage] = useQueryParamState(
 *   setState,
 *   'page',
 *   parseInt(state.page ?? '1', 10),
 *   1,
 *   (value) => value.toString()
 * );
 */
function useQueryParamState<T>(
  setState: Dispatch<SetStateAction<QueryState>>,
  paramName: string,
  initialValue: T,
  defaultValue: T,
  transform: (value: T) => string = String
): [T, (newValue: T) => void] {
  // Initialize state from URL parameter if present
  const [localState, setLocalState] = useState<T>(initialValue);

  const setValue = useCallback(
    (newValue: T) => {
      setLocalState(newValue);
      setState((prev: QueryState) => {
        if (newValue === defaultValue) {
          const withoutParamSet = { ...prev };
          delete withoutParamSet[paramName];
          return withoutParamSet;
        } else {
          return {
            ...prev,
            [paramName]: transform(newValue),
          };
        }
      });
    },
    [setState, paramName, defaultValue, transform]
  );

  return [localState, setValue];
}

export default useQueryParamState;