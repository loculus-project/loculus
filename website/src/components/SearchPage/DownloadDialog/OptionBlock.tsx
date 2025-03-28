import type { FC, ReactElement } from 'react';

export type OptionBlockProps = {
    name: string;
    title?: string;
    options: {
        label: ReactElement;
        subOptions?: ReactElement;
    }[];
    selected: number;
    onSelect: (index: number) => void;
    disabled?: boolean;
    variant?: 'default' | 'nested';
};

export const RadioOptionBlock: FC<OptionBlockProps> = ({
    name,
    title,
    options,
    selected,
    onSelect,
    disabled = false,
    variant = 'default',
}) => {
    return (
        <div className={(variant === 'nested' ? 'px-4 mr-10' : '') + ' flex-1 min-w-60 justify-start'}>
            {title !== undefined && (
                <h4 className={variant === 'nested' ? 'text-sm font-normal' : 'font-bold'}>{title}</h4>
            )}
            {options.map((option, index) => (
                <div key={index} className={disabled ? 'bg-gray-100' : ''}>
                    <label className='label justify-start py-1 items-baseline'>
                        <input
                            type='radio'
                            name={name}
                            className='mr-4 text-primary-600 focus:ring-primary-600 relative bottom-[-0.2rem] disabled:opacity-50'
                            checked={index === selected}
                            onChange={() => onSelect(index)}
                            disabled={disabled}
                        />
                        <span
                            className={`label-text ${disabled ? 'text-gray-500' : ''} ${variant === 'nested' ? 'text-sm' : ''}`}
                        >
                            {option.label}
                        </span>
                    </label>
                    {option.subOptions}
                </div>
            ))}
        </div>
    );
};

export const DropdownOptionBlock: FC<OptionBlockProps> = ({
    name,
    title,
    options,
    selected,
    onSelect,
    disabled = false,
}) => {
    return (
        <div className='max-w-80'>
            <select
                name={name}
                className='select select-bordered w-full max-w-xs min-h-0 h-auto py-0'
                disabled={disabled}
                value={selected}
                onChange={(event) => onSelect(event.target.selectedIndex)}
            >
                {title !== undefined && (
                    <option disabled selected>
                        {title}
                    </option>
                )}
                {options.map((option, index) => (
                    <option key={index} value={index}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
};
