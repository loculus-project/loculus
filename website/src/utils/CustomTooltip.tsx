import type { ComponentProps, FC } from 'react';
import { Tooltip } from 'react-tooltip';

export const CustomTooltip: FC<ComponentProps<typeof Tooltip>> = ({ className, ...props }) => {
    const isTouchOnly = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

    // Set positionStrategy and z-index to make the Tooltip float above the ReviewPage toolbar
    return (
        <Tooltip
            positionStrategy='fixed'
            place='right'
            className={`z-20 max-w-sm whitespace-pre-wrap break-words ${className ?? ''}`}
            openEvents={{ mouseenter: !isTouchOnly, click: isTouchOnly, focus: false }}
            closeEvents={{ mouseleave: !isTouchOnly, click: isTouchOnly, blur: true }}
            globalCloseEvents={{ clickOutsideAnchor: true, scroll: true }}
            {...props}
        />
    );
};
