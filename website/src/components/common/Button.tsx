import { type ButtonHTMLAttributes, type FC } from 'react';

import DisabledUntilHydrated from '../DisabledUntilHydrated';

export const Button: FC<ButtonHTMLAttributes<HTMLButtonElement> & { alsoDisabledIf?: boolean }> = ({
    alsoDisabledIf,
    ...props
}) => {
    return (
        <DisabledUntilHydrated alsoDisabledIf={alsoDisabledIf}>
            {/* eslint-disable-next-line no-restricted-syntax -- This is the wrapper component itself */}
            <button {...props} />
        </DisabledUntilHydrated>
    );
};
