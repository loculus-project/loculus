import type { FC, ReactNode } from 'react';

import { Button } from './Button';

type BoxWithTabsTabBarProps = {
    children: ReactNode;
};

export const BoxWithTabsTabBar: FC<BoxWithTabsTabBarProps> = ({ children }) => (
    <div className='-mb-px flex flex-wrap'>{children}</div>
);

type BoxWithTabsTabProps = {
    isActive: boolean;
    label: string;
    onClick?: () => void;
    className?: string;
};

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
