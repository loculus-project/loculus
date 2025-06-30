import { Children, cloneElement, type FC, type ReactElement } from 'react';

import useClientFlag from '../hooks/isClient';

interface DisabledUntilHydratedProps {
    children: ReactElement<{ disabled?: boolean }>;
    alsoDisabledIf?: boolean;
}

/**
 * Wraps a single child element and disables it until the client has hydrated.
 */
const DisabledUntilHydrated: FC<DisabledUntilHydratedProps> = ({ children, alsoDisabledIf = false }) => {
    const isClient = useClientFlag();

    // Ensure that there is exactly one child element
    const child = Children.only(children);
    // Error if we're overriding a `disabled` prop
    if (child.props.disabled !== undefined) {
        throw new Error(
            'DisabledUntilHydrated: child element should not set its own `disabled` prop—it will be overridden.',
        );
    }

    return cloneElement(child, { disabled: !isClient || alsoDisabledIf });
};

export default DisabledUntilHydrated;
