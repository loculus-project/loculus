import { type FC, type ReactNode, useId } from 'react';
import { Tooltip } from 'react-tooltip';

type TooltipVariant = 'info' | 'warning' | 'error';
type TooltipPlace = 'top' | 'right' | 'bottom' | 'left';

interface HoverTooltipProps {
    content: string;
    variant?: TooltipVariant;
    place?: TooltipPlace;
    alwaysOpen?: boolean;
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
        <span className={`inline-block ${className}`} data-tooltip-id={id} data-tooltip-content={content}>
            {children}
            <Tooltip
                id={id}
                place={place}
                variant={variant}
                isOpen={alwaysOpen}
                positionStrategy='fixed'
                className='z-30 max-w-sm whitespace-pre-line break-words'
            />
        </span>
    );
};
