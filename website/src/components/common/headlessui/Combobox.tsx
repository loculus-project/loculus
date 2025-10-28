import {
    Combobox as HeadlessCombobox,
    type ComboboxProps,
    ComboboxButton,
    ComboboxInput,
    ComboboxOption,
    ComboboxOptions,
} from '@headlessui/react';

import { useDisabledUntilHydrated } from '../../../hooks/useDisabledUntilHydrated';

/**
 * Wrapper around Headless UI Combobox that automatically disables the component
 * until React hydration completes. This prevents race conditions where users
 * (or automated tests) interact with the component before it's fully hydrated.
 *
 * Usage: Import from this file instead of '@headlessui/react'
 */
export function Combobox<T, TMultiple extends boolean | undefined = undefined>(props: ComboboxProps<T, TMultiple>) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const disabled = useDisabledUntilHydrated((props as any).disabled);
    return <HeadlessCombobox {...props} disabled={disabled} />;
}

// Re-export all subcomponents unchanged
export { ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions };
