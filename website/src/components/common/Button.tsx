import { type AnchorHTMLAttributes, type ButtonHTMLAttributes, type Ref, forwardRef } from 'react';

import { type ButtonSize, type ButtonVariant, buttonClasses } from './buttonStyles';
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

const resolveClassName = ({ variant, size, circle, className }: StyleProps & { className?: string }) => {
    const styled = variant !== undefined || size !== undefined || circle !== undefined;
    return styled ? buttonClasses({ variant, size, circle, className }) : className;
};

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>((props, ref) => {
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
    return (
        <DisabledUntilHydrated alsoDisabledIf={alsoDisabledIf ?? disabled}>
            {/* eslint-disable-next-line no-restricted-syntax -- This is the wrapper component itself */}
            <button
                ref={ref as Ref<HTMLButtonElement>}
                className={resolveClassName({ variant, size, circle, className })}
                {...rest}
            />
        </DisabledUntilHydrated>
    );
});

Button.displayName = 'Button';
