import { Listbox as HeadlessListbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';

import useClientFlag from '../../../hooks/isClient';

/**
 * Wrapper around Headless UI Listbox that automatically disables the component
 * until React hydration completes. This prevents race conditions where users
 * (or automated tests) interact with the component before it's fully hydrated.
 *
 * Usage: Import from this file instead of '@headlessui/react'
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Listbox(props: any) {
    const isClient = useClientFlag();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return <HeadlessListbox {...props} disabled={props.disabled ?? !isClient} />;
}

// Re-export all subcomponents unchanged
export { ListboxButton, ListboxOption, ListboxOptions };
