import { Tooltip } from 'react-tooltip';

import type { InputField } from '../../types/config';

interface InputFieldTooltipProps {
    id: string;
    field: InputField;
    place?: 'top' | 'right' | 'bottom' | 'left';
    positionStrategy?: 'absolute' | 'fixed';
    className?: string;
    delayShow?: number;
}

export const InputFieldTooltip = ({
    id,
    field,
    place = 'right',
    positionStrategy = 'fixed',
    className = 'z-20 max-w-80 space-y-2 whitespace-normal',
    delayShow = 200,
}: InputFieldTooltipProps) => (
    <Tooltip id={id} place={place} positionStrategy={positionStrategy} className={className} delayShow={delayShow}>
        <p>
            <span className='font-mono font-semibold text-gray-300'>{field.name}</span>
        </p>
        {field.definition && <p>{field.definition}</p>}
        {field.guidance && <p>{field.guidance}</p>}
    </Tooltip>
);
