import { cloneElement, type FC, type ReactElement } from 'react';

import useClientFlag from '../hooks/isClient';

interface DisabledUntilHydratedProps {
    children: ReactElement;
    alsoDisabledIf?: boolean;
}

/**
 * Wraps a single child element and disables it until the client has hydrated.
 */
const DisabledUntilHydrated: FC<DisabledUntilHydratedProps> = ({ children, alsoDisabledIf = false }) => {
    const isClient = useClientFlag();
    return cloneElement(children, { disabled: !isClient || alsoDisabledIf });
};

export default DisabledUntilHydrated;
