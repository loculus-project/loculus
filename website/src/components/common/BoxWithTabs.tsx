import type { FC, ReactNode } from 'react';

import { Button } from './Button';

type BoxWithTabsTabBarProps = {
    children: ReactNode;
};

export const BoxWithTabsTabBar: FC<BoxWithTabsTabBarProps> = ({ children }) => (
    // Lifted tabs (daisyUI `tabs tabs-lift`): the row sits on the content box's
    // top border (provided by BoxWithTabsBox). `-mb-px` overlaps that border so
    // the active tab's white bottom edge covers it, opening the tab into the
    // content below. The bar itself has no bottom rule.
    <div className='-mb-px flex flex-wrap'>{children}</div>
);

type BoxWithTabsTabProps = {
    isActive: boolean;
    label: string;
    onClick?: () => void;
    className?: string;
};

// Border colour is set per-variant (not in the base) so the active tab's
// `border-base-300` isn't overridden by a base `border-transparent` in the
// generated stylesheet. The active tab draws top/left/right borders and a white
// bottom edge that merges with the content box below (the lifted look).
const tabBase = 'relative h-10 px-3 text-sm border rounded-t-lg';
const tabInactive = 'border-transparent text-base-content/50 hover:text-base-content';
const tabActive = 'z-10 font-semibold text-base-content bg-white border-base-300 border-b-white';

export const BoxWithTabsTab: FC<BoxWithTabsTabProps> = ({ isActive, label, onClick, className }) => (
    <Button
        className={`${tabBase} ${isActive ? tabActive : tabInactive} ${className ?? ''}`.trimEnd()}
        onClick={onClick}
    >
        {label}
    </Button>
);

type BoxWithTabsBoxProps = {
    children: ReactNode;
};

export const BoxWithTabsBox: FC<BoxWithTabsBoxProps> = ({ children }) => <div className='border p-4'>{children}</div>;
