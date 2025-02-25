import { type FC } from 'react';

type FieldSelectorButtonProps = {
    onClick: () => void;
    selectedFieldsCount: number;
};

export const FieldSelectorButton: FC<FieldSelectorButtonProps> = ({ onClick, selectedFieldsCount }) => {
    return (
        <button
            type='button'
            onClick={onClick}
            className='inline-flex items-center px-3 py-2 text-sm font-medium border border-gray-300 rounded-md shadow-sm bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500'
        >
            <span>Customize fields ({selectedFieldsCount})</span>
        </button>
    );
};
