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
    // Reproduces daisyUI's `alert alert-error` / `alert-warning`: a horizontal
    // icon + content row (grid auto-flow column) with the semantic fill colour.
    const levelClass = level === 'error' ? 'bg-error text-error-content' : 'bg-warning text-warning-content';
    const alertClass = `${className} grid grid-flow-col auto-cols-max items-center gap-4 px-4 py-3 rounded-lg text-sm [&_a]:font-bold [&_a]:underline ${levelClass}`;

    return (
        <div role='alert' className={alertClass}>
            {level === 'error' && <DangerousTwoToneIcon />}
            {level === 'warning' && <WarningTwoToneIcon />}
            <div className='grid-flow-row'>
                {title !== undefined && <p className='text-lg font-bold'>{title}</p>}
                {children}
            </div>
        </div>
    );
};

export default ErrorBox;
