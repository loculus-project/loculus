import type { ComponentProps, FC } from 'react';
import { Tooltip } from 'react-tooltip';

export const CustomTooltip: FC<ComponentProps<typeof Tooltip>> = ({ className, ...props }) => (
    // Set positionStrategy and z-index to make the Tooltip float above the ReviewPage toolbar
    <Tooltip
        positionStrategy='fixed'
        place='right'
        className={`z-20 max-w-sm whitespace-pre-wrap break-words ${className ?? ''}`}
        {...props}
    />
);
