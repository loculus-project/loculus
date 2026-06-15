import { type InputHTMLAttributes, forwardRef } from 'react';

import DisabledUntilHydrated from '../DisabledUntilHydrated';

type CheckboxSize = 'sm' | 'md';

const base = 'border border-base-content/20 text-primary-600 focus:ring-primary-600 shrink-0 rounded-md';
const sizeClasses: Record<CheckboxSize, string> = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
};

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & {
    size?: CheckboxSize;
    alsoDisabledIf?: boolean;
    outline?: boolean;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
    ({ size = 'md', className = '', alsoDisabledIf, disabled, outline, ...props }, ref) => (
        <DisabledUntilHydrated alsoDisabledIf={alsoDisabledIf ?? disabled}>
            <input
                ref={ref}
                type='checkbox'
                className={`${base} ${sizeClasses[size]} ${outline ? 'checkbox-outline' : ''} ${className}`.trim()}
                {...props}
            />
        </DisabledUntilHydrated>
    ),
);

Checkbox.displayName = 'Checkbox';
