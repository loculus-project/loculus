import { type ButtonHTMLAttributes, forwardRef } from 'react';

import { type ButtonSize, type ButtonVariant, buttonClasses } from './buttonStyles';
import DisabledUntilHydrated from '../DisabledUntilHydrated';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    alsoDisabledIf?: boolean;
    /** When set, applies the shared button styling (daisyUI-`btn` replacement). */
    variant?: ButtonVariant;
    size?: ButtonSize;
    circle?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ alsoDisabledIf, disabled, variant, size, circle, className, ...props }, ref) => {
        // Only style the button when a button-shape prop is given; otherwise the
        // caller's className passes through unchanged (this component is also used
        // as a bare hydration-safe <button> wrapper).
        const styled = variant !== undefined || size !== undefined || circle !== undefined;
        const resolvedClassName = styled ? buttonClasses({ variant, size, circle, className }) : className;
        return (
            <DisabledUntilHydrated alsoDisabledIf={alsoDisabledIf ?? disabled}>
                {/* eslint-disable-next-line no-restricted-syntax -- This is the wrapper component itself */}
                <button ref={ref} className={resolvedClassName} {...props} />
            </DisabledUntilHydrated>
        );
    },
);

Button.displayName = 'Button';
