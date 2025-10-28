import { type ButtonHTMLAttributes, type FC } from 'react';

import useClientFlag from '../../hooks/isClient';

export const Button: FC<ButtonHTMLAttributes<HTMLButtonElement> & { alsoDisabledIf?: boolean }> = ({
    alsoDisabledIf,
    ...props
}) => {
    const isClient = useClientFlag();
    const isDisabled = (props.disabled ?? false) || !isClient || (alsoDisabledIf ?? false);
    return <button {...props} disabled={isDisabled} />;
};
