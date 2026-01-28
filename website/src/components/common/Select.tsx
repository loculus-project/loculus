import { type SelectHTMLAttributes, forwardRef } from 'react';

import DisabledUntilHydrated from '../DisabledUntilHydrated';

export const Select = forwardRef<
    HTMLSelectElement,
    SelectHTMLAttributes<HTMLSelectElement> & { alsoDisabledIf?: boolean }
>(({ alsoDisabledIf, disabled, ...props }, ref) => {
    return (
        <DisabledUntilHydrated alsoDisabledIf={alsoDisabledIf ?? disabled}>
            <select ref={ref} {...props} />
        </DisabledUntilHydrated>
    );
});

Select.displayName = 'Select';