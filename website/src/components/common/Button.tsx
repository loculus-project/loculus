import { type ButtonHTMLAttributes, type FC } from 'react';

import { useDisabledUntilHydrated } from '../../hooks/useDisabledUntilHydrated';

export const Button: FC<ButtonHTMLAttributes<HTMLButtonElement> & { alsoDisabledIf?: boolean }> = ({
    alsoDisabledIf,
    ...props
}) => {
    const disabled = useDisabledUntilHydrated(props.disabled, alsoDisabledIf);
    return <button {...props} disabled={disabled} />;
};
