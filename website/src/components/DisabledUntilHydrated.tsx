import { cloneElement, type FC, type ReactElement } from 'react';

import useClientFlag from '../hooks/isClient';

interface DisabledUntilHydratedProps {
    children: ReactElement;
}

/**
 * Wraps a single child element and disables it until the client has hydrated.
 */
const DisabledUntilHydrated: FC<DisabledUntilHydratedProps> = ({ children }) => {
    const isClient = useClientFlag();
    return cloneElement(children, { disabled: !isClient });
};

export default DisabledUntilHydrated;
