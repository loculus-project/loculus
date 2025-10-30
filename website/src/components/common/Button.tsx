import { type ButtonHTMLAttributes, forwardRef } from 'react';

import DisabledUntilHydrated from '../DisabledUntilHydrated';

export const Button = forwardRef<
    HTMLButtonElement,
    ButtonHTMLAttributes<HTMLButtonElement> & { alsoDisabledIf?: boolean }
>(({ alsoDisabledIf, ...props }, ref) => {
    return (
        <DisabledUntilHydrated alsoDisabledIf={alsoDisabledIf}>
            {/* eslint-disable-next-line no-restricted-syntax -- This is the wrapper component itself */}
            <button ref={ref} {...props} />
        </DisabledUntilHydrated>
    );
});

Button.displayName = 'Button';
