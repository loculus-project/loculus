import React, { type ReactNode, useEffect, useState } from 'react';

interface FloatingLabelContainerProps {
    label: string;
    isFocused: boolean;
    hasContent: boolean;
    children: ReactNode;
    onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
    className?: string;
    borderClassName?: string;
    htmlFor?: string;
}

/**
 * A shared container component that provides a floating label effect.
 * Used by AutoCompleteField and MutationField for consistent styling.
 */
export const FloatingLabelContainer: React.FC<FloatingLabelContainerProps> = ({
    label,
    isFocused,
    hasContent,
    children,
    onClick,
    className = '',
    borderClassName,
    htmlFor,
}) => {
    // Disable transitions on initial load to prevent animation on page load
    const [isTransitionEnabled, setIsTransitionEnabled] = useState(false);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setIsTransitionEnabled(true);
        }, 100); // Small delay to ensure initial render is complete

        return () => clearTimeout(timeout);
    }, []);

    // Use provided border classes or default based on focus state
    const borderClasses = borderClassName ?? (isFocused ? 'border-blue-600' : 'border-gray-300 hover:border-gray-400');

    return (
        <div className='relative'>
            <div
                className={`relative flex flex-wrap items-center rounded-md cursor-text transition-colors bg-white min-h-[52px] border ${borderClasses} ${className}`}
                onClick={onClick}
            >
                {children}
            </div>
            {/* Floating label */}
            <label
                htmlFor={htmlFor}
                className={`absolute text-sm ${isTransitionEnabled ? 'duration-300' : ''} transform z-10 origin-[0] bg-white px-2 start-1 pointer-events-none ${
                    hasContent || isFocused
                        ? `-translate-y-3 scale-75 top-1 ${isFocused ? 'text-blue-600' : 'text-gray-500'}`
                        : 'text-gray-500 scale-100 -translate-y-1/2 top-1/2'
                }`}
            >
                {label}
            </label>
        </div>
    );
};
