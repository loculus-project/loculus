import {
    Combobox as HeadlessCombobox,
    type ComboboxProps,
    ComboboxButton,
    ComboboxInput,
    ComboboxOption,
    ComboboxOptions,
} from '@headlessui/react';

import DisabledUntilHydrated from '../../DisabledUntilHydrated';

/**
 * Wrapper around Headless UI Combobox that automatically disables the component
 * until React hydration completes. This prevents race conditions where users
 * (or automated tests) interact with the component before it's fully hydrated.
 *
 * Usage: Import from this file instead of '@headlessui/react'
 */
export function Combobox<T, TMultiple extends boolean | undefined = undefined>(props: ComboboxProps<T, TMultiple>) {
    return (
        <DisabledUntilHydrated>
            <HeadlessCombobox {...props} />
        </DisabledUntilHydrated>
    );
}

// Re-export all subcomponents unchanged
export { ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions };
