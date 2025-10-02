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
        'flex items-center gap-1 px-4 pt-2.5 pb-1.5 min-h-[3rem] text-sm font-medium transition-colors duration-150 rounded-t-lg border border-transparent border-b-2';
    const stateClasses = isActive
        ? 'bg-white text-slate-900 border-slate-200 border-b-primary-400 shadow-[0_6px_12px_-8px_rgba(15,23,42,0.25)]'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 hover:border-slate-200';

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
