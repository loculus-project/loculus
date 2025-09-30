import React from 'react';

interface SubmenuLinkProps {
    href: string;
    isActive: boolean;
    children: React.ReactNode;
    className?: string;
}

export const SubmenuLink: React.FC<SubmenuLinkProps> = ({ href, isActive, children, className = '' }) => {
    const baseClasses = 'flex items-center gap-1.5 px-2.5 py-1 rounded text-sm transition-colors font-medium';
    const stateClasses = isActive ? 'bg-primary-100 text-gray-800' : 'text-gray-700 hover:bg-gray-100';

    return (
        <a
            href={href}
            className={`${baseClasses} ${stateClasses} ${className}`.trim()}
            aria-current={isActive ? 'page' : undefined}
        >
            {children}
        </a>
    );
};
