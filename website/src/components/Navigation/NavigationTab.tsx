import React, { type ButtonHTMLAttributes } from 'react';

import { Button } from '../common/Button';

type NavigationTabProps =
    | {
          isActive?: boolean;
          children: React.ReactNode;
          as: 'a';
          href: string;
          className?: string;
      }
    | (Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> & {
          isActive?: boolean;
          children: React.ReactNode;
          as?: 'button';
          className?: string;
      });

export const NavigationTab = React.forwardRef<HTMLButtonElement, NavigationTabProps>((props, ref) => {
    const { isActive = false, children, className = '' } = props;

    const baseClasses =
        'flex items-center gap-1 px-4 pt-2.5 pb-1.5 min-h-12 text-sm font-medium transition-colors duration-150 rounded-t-lg border border-transparent border-b-2';
    const stateClasses = isActive
        ? 'bg-white text-slate-900 border-slate-200 border-b-primary-400 shadow-[0_6px_12px_-8px_rgba(15,23,42,0.25)]'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 hover:border-slate-200';

    const combinedClassName = `${baseClasses} ${stateClasses} ${className}`.trim();

    if (props.as === 'a') {
        return (
            <a href={props.href} className={combinedClassName}>
                {children}
            </a>
        );
    }

    // The remaining props (click and keyboard handlers, aria and data attributes) are passed through so the
    // tab can act as the trigger of a Headless UI menu.
    const { isActive: _isActive, children: _children, className: _className, as: _as, ...buttonProps } = props;

    return (
        <Button ref={ref} className={combinedClassName} {...buttonProps}>
            {children}
        </Button>
    );
});

NavigationTab.displayName = 'NavigationTab';
