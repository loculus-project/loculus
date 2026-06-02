import { type InputHTMLAttributes, forwardRef } from 'react';

import DisabledUntilHydrated from '../DisabledUntilHydrated';

/*
 * Shared checkbox, replacing daisyUI's `checkbox`. Sizes match daisyUI v5
 * (sm 20px / md 24px), rounded, with a base-content/20 border. The unchecked
 * white fill and the checked fill + checkmark come from the global
 * @tailwindcss/forms reset (the checked fill follows `text-base-content`).
 *
 * Like Button/Select it is disabled until React has hydrated, so Playwright
 * can't toggle it before its onChange handler is wired up.
 */
type CheckboxSize = 'sm' | 'md';

const base = 'border border-base-content/20 text-base-content shrink-0 rounded-md';
const sizeClasses: Record<CheckboxSize, string> = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
};

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & {
    size?: CheckboxSize;
    alsoDisabledIf?: boolean;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
    ({ size = 'md', className = '', alsoDisabledIf, disabled, ...props }, ref) => (
        <DisabledUntilHydrated alsoDisabledIf={alsoDisabledIf ?? disabled}>
            <input
                ref={ref}
                type='checkbox'
                className={`${base} ${sizeClasses[size]} ${className}`.trim()}
                {...props}
            />
        </DisabledUntilHydrated>
    ),
);

Checkbox.displayName = 'Checkbox';
