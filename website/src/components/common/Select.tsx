import { type SelectHTMLAttributes, forwardRef } from 'react';

import DisabledUntilHydrated from '../DisabledUntilHydrated';

const styledSelectClasses =
    'h-10 px-3 pr-8 rounded border border-base-content/20 bg-white text-sm ' +
    'focus:outline-none focus:border-base-content/40 focus:ring-1 focus:ring-base-content/20';

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
    alsoDisabledIf?: boolean;
    styled?: boolean;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
    ({ alsoDisabledIf, disabled, styled, className = '', ...props }, ref) => {
        const resolvedClassName = styled ? `${styledSelectClasses} ${className}`.trim() : className;
        return (
            <DisabledUntilHydrated alsoDisabledIf={alsoDisabledIf ?? disabled}>
                <select ref={ref} className={resolvedClassName} {...props} />
            </DisabledUntilHydrated>
        );
    },
);

Select.displayName = 'Select';
