import React from 'react';

import DangerousTwoToneIcon from '~icons/material-symbols/error-outline';
import WarningTwoToneIcon from '~icons/material-symbols/warning-outline';

interface Props {
    title?: string;
    level?: 'error' | 'warning';
    children: React.ReactNode;
}

const ErrorBox: React.FC<Props> = ({ title, children, level = 'error' }) => {
    const alertClass = `my-8 alert ${level === 'error' ? 'alert-error' : 'alert-warning'}`;

    const ContentWithStyledLinks: React.FC<{ children: React.ReactNode }> = ({ children }) => {
        return React.Children.map(children, (child) => {
            if (React.isValidElement(child) && child.type === 'a') {
                return React.cloneElement(child as React.ReactElement, {
                    className: `font-bold underline ${child.props.className ?? ''}`.trim(),
                });
            }
            return child;
        });
    };

    return (
        <div className={alertClass}>
            {level === 'error' && <DangerousTwoToneIcon />}
            {level === 'warning' && <WarningTwoToneIcon />}
            <div className='grid-flow-row'>
                {title !== undefined && <p className='text-lg font-bold'>{title}</p>}
                <ContentWithStyledLinks>{children}</ContentWithStyledLinks>
            </div>
        </div>
    );
};

export default ErrorBox;
