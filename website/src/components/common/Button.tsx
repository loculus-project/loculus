import { type AnchorHTMLAttributes, type ButtonHTMLAttributes, type Ref, forwardRef } from 'react';

import { type ButtonSize, type ButtonVariant, buttonClasses } from './buttonStyles';
import useClientFlag from '../../hooks/isClient';
import DisabledUntilHydrated from '../DisabledUntilHydrated';

type StyleProps = {
    variant?: ButtonVariant;
    size?: ButtonSize;
    circle?: boolean;
};

type ButtonElementProps = StyleProps &
    ButtonHTMLAttributes<HTMLButtonElement> & {
        as?: 'button';
        alsoDisabledIf?: boolean;
    };

type AnchorElementProps = StyleProps &
    AnchorHTMLAttributes<HTMLAnchorElement> & {
        as: 'a';
    };

export type ButtonProps = ButtonElementProps | AnchorElementProps;

const resolveClassName = ({
    variant,
    size,
    circle,
    className,
    disabled = false,
}: StyleProps & { className?: string; disabled?: boolean }) => {
    const styled = variant !== undefined || size !== undefined || circle !== undefined;
    return styled ? buttonClasses({ variant, size, circle, className, disabled }) : className;
};

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>((props, ref) => {
    const isClient = useClientFlag();

    if (props.as === 'a') {
        const { as: _as, variant, size, circle, className, ...rest } = props;
        return (
            <a
                ref={ref as Ref<HTMLAnchorElement>}
                className={resolveClassName({ variant, size, circle, className })}
                {...rest}
            />
        );
    }

    const { as: _as, alsoDisabledIf, disabled, variant, size, circle, className, ...rest } = props;
    const reallyDisabled = alsoDisabledIf ?? disabled ?? false;
    // The button is also disabled until hydration completes (see DisabledUntilHydrated below).
    // When that is the *only* reason it's disabled, keep the normal enabled look and just show a
    // loading cursor, rather than flashing the greyed-out disabled style before the page is ready.
    const hydrating = !isClient && !reallyDisabled;
    return (
        <DisabledUntilHydrated alsoDisabledIf={alsoDisabledIf ?? disabled}>
            {/* eslint-disable-next-line no-restricted-syntax -- This is the wrapper component itself */}
            <button
                ref={ref as Ref<HTMLButtonElement>}
                className={resolveClassName({
                    variant,
                    size,
                    circle,
                    disabled: reallyDisabled,
                    className: [className, hydrating ? 'cursor-wait' : ''].filter(Boolean).join(' ') || undefined,
                })}
                {...rest}
            />
        </DisabledUntilHydrated>
    );
});

Button.displayName = 'Button';
