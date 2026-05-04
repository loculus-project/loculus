import type { FC, ReactNode } from 'react';

import { Button } from './Button';

type BoxWithTabsTabBarProps = {
    children: ReactNode;
};

export const BoxWithTabsTabBar: FC<BoxWithTabsTabBarProps> = ({ children }) => (
    <div className='tabs -mb-px tabs-lifted flex flex-wrap'>{children}</div>
);

type BoxWithTabsTabProps = {
    isActive: boolean;
    label: string;
    onClick?: () => void;
    className?: string;
};

export const BoxWithTabsTab: FC<BoxWithTabsTabProps> = ({ isActive, label, onClick, className }) => (
    <Button
        className={`tab ${isActive ? 'tab-active font-semibold' : ''} ${className ?? ''}`.trimEnd()}
        onClick={onClick}
    >
        {label}
    </Button>
);

type BoxWithTabsBoxProps = {
    children: ReactNode;
};

export const BoxWithTabsBox: FC<BoxWithTabsBoxProps> = ({ children }) => <div className='border p-4'>{children}</div>;
