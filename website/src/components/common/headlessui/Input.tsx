/* eslint-disable no-restricted-imports */
import { Input as HeadlessInput } from '@headlessui/react';
/* eslint-enable no-restricted-imports */

import DisabledUntilHydrated from '../../DisabledUntilHydrated';

/**
 * Wrapper around Headless UI Input that automatically disables the component
 * until React hydration completes. This prevents race conditions where users
 * (or automated tests) interact with the component before it's fully hydrated.
 *
 * Usage: Import from this file instead of '@headlessui/react'
 */
const InputImpl: typeof HeadlessInput = function Input(props) {
    return (
        <DisabledUntilHydrated>
            <HeadlessInput {...props} />
        </DisabledUntilHydrated>
    );
};

InputImpl.displayName = HeadlessInput.displayName || 'Input';

export const Input = InputImpl;
