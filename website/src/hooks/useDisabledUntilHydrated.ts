import useClientFlag from './isClient';

/**
 * Hook that returns the disabled state for a component that should be disabled
 * until React hydration completes.
 *
 * @param disabled - Additional disabled condition (optional)
 * @param alsoDisabledIf - Additional disabled condition (optional, for compatibility with DisabledUntilHydrated)
 * @returns true if the component should be disabled
 */
export function useDisabledUntilHydrated(disabled?: boolean, alsoDisabledIf?: boolean): boolean {
    const isClient = useClientFlag();
    return (disabled ?? false) || !isClient || (alsoDisabledIf ?? false);
}
