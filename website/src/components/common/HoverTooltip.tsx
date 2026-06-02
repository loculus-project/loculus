import { type FC, type ReactNode, useId } from 'react';
import { Tooltip } from 'react-tooltip';

/*
 * Hover tooltip replacing daisyUI's `tooltip` component (the `tooltip` /
 * `tooltip-info|warning|error` / `tooltip-open` classes driven by `data-tip`).
 * Built on react-tooltip, which the app already uses elsewhere. The trigger is
 * wrapped in an anchor element; `className` is forwarded to that wrapper so any
 * styling the daisyUI element carried (e.g. `text-error` colouring the icon) is
 * preserved.
 */
type TooltipVariant = 'info' | 'warning' | 'error';
type TooltipPlace = 'top' | 'right' | 'bottom' | 'left';

interface HoverTooltipProps {
    content: string;
    variant?: TooltipVariant;
    place?: TooltipPlace;
    /** Force the tooltip permanently visible (daisyUI `tooltip-open`). */
    alwaysOpen?: boolean;
    /** Classes for the wrapper element around the trigger. */
    className?: string;
    children: ReactNode;
}

export const HoverTooltip: FC<HoverTooltipProps> = ({
    content,
    variant = 'info',
    place = 'top',
    alwaysOpen,
    className = '',
    children,
}) => {
    const id = useId();
    return (
        <span className={`inline-block ${className}`} data-tooltip-id={id}>
            {children}
            <Tooltip
                id={id}
                content={content}
                place={place}
                variant={variant}
                isOpen={alwaysOpen}
                positionStrategy='fixed'
                className='z-30 max-w-sm whitespace-pre-line break-words'
            />
        </span>
    );
};
