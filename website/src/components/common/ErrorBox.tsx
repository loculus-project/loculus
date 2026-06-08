import React from 'react';

import DangerousTwoToneIcon from '~icons/material-symbols/error-outline';
import WarningTwoToneIcon from '~icons/material-symbols/warning-outline';

interface Props {
    title?: string;
    level?: 'error' | 'warning';
    className?: string;
    children: React.ReactNode;
}

const ErrorBox: React.FC<Props> = ({ title, children, level = 'error', className = 'my-8' }) => {
    const levelClass = level === 'error' ? 'bg-error text-error-content' : 'bg-warning text-black';
    const alertClass = `${className} flex items-center gap-4 px-4 py-3 rounded-lg text-base [&_a]:font-bold [&_a]:underline ${levelClass}`;

    return (
        <div role='alert' className={alertClass}>
            {level === 'error' && <DangerousTwoToneIcon className='shrink-0' />}
            {level === 'warning' && <WarningTwoToneIcon className='shrink-0' />}
            <div className='min-w-0'>
                {title !== undefined && <p className='text-lg font-bold'>{title}</p>}
                {children}
            </div>
        </div>
    );
};

export default ErrorBox;
