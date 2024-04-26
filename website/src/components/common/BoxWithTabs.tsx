import type { FC, ReactNode } from 'react';

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
};

export const BoxWithTabsTab: FC<BoxWithTabsTabProps> = ({ isActive, label, onClick }) => (
    <button className={`tab ${isActive ? 'tab-active' : ''}`} onClick={onClick}>
        {label}
    </button>
);

type BoxWithTabsBoxProps = {
    children: ReactNode;
};

export const BoxWithTabsBox: FC<BoxWithTabsBoxProps> = ({ children }) => (
    <div className='border p-4 max-w-[1000px]'>{children}</div>
);
