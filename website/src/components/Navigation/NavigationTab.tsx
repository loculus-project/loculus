import React from 'react';

interface NavigationTabProps {
    isActive?: boolean;
    children: React.ReactNode;
    as?: 'button' | 'a';
    href?: string;
    onClick?: () => void;
    className?: string;
    'aria-current'?: 'page' | undefined;
    'aria-expanded'?: boolean | undefined;
    'aria-haspopup'?: boolean | 'menu' | undefined;
}

export const NavigationTab: React.FC<NavigationTabProps> = ({
    isActive = false,
    children,
    as: Component = 'button',
    href,
    onClick,
    className = '',
    ...ariaProps
}) => {
    const baseClasses = 'flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-t-lg border-2 border-b-2 transition-colors';
    const stateClasses = isActive
        ? 'bg-white text-slate-900 border-slate-200 border-b-primary-400 shadow-sm'
        : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 hover:border-slate-200';

    const combinedClassName = `${baseClasses} ${stateClasses} ${className}`.trim();

    if (Component === 'a' && href) {
        return (
            <a href={href} className={combinedClassName} {...ariaProps}>
                {children}
            </a>
        );
    }

    return (
        <button onClick={onClick} className={combinedClassName} {...ariaProps}>
            {children}
        </button>
    );
};