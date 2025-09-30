import React from 'react';

interface NavigationTabProps {
    isActive?: boolean;
    children: React.ReactNode;
    as?: 'button' | 'a';
    href?: string;
    onClick?: () => void;
    className?: string;
}

export const NavigationTab: React.FC<NavigationTabProps> = ({
    isActive = false,
    children,
    as: component = 'button',
    href,
    onClick,
    className = '',
}) => {
    const baseClasses =
        'flex items-center gap-1 px-4 py-2 min-h-[3rem] text-sm font-medium rounded-t-lg border-2 border-b-2 transition-colors';
    const stateClasses = isActive
        ? 'bg-white text-slate-900 border-slate-200 border-b-primary-400 shadow-sm'
        : 'border-transparent border-b-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50';

    const combinedClassName = `${baseClasses} ${stateClasses} ${className}`.trim();

    if (component === 'a' && href) {
        return (
            <a href={href} className={combinedClassName}>
                {children}
            </a>
        );
    }

    return (
        <button onClick={onClick} className={combinedClassName}>
            {children}
        </button>
    );
};
