import { type FC } from 'react';
import { Button } from "src/components/common/Button";

type FieldSelectorButtonProps = {
    onClick: () => void;
    selectedFieldsCount: number;
    disabled?: boolean;
};

export const FieldSelectorButton: FC<FieldSelectorButtonProps> = ({
    onClick,
    selectedFieldsCount,
    disabled = false,
}) => {
    return (
        <Button
            type='button'
            onClick={onClick}
            disabled={disabled}
            className={`inline-flex items-center px-2 py-1 text-xs font-medium border border-gray-300 rounded-md shadow-sm 
                ${
                    disabled
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500'
                }`}
        >
            <span>Choose fields ({selectedFieldsCount})</span>
        </Button>
    );
};
