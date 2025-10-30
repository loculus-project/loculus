import type { FC, ReactNode } from 'react';
import { Button } from "src/components/common/Button";

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
    <Button className={`tab ${isActive ? 'tab-active font-semibold' : ''}`} onClick={onClick}>
        {label}
    </Button>
);

type BoxWithTabsBoxProps = {
    children: ReactNode;
};

export const BoxWithTabsBox: FC<BoxWithTabsBoxProps> = ({ children }) => <div className='border p-4'>{children}</div>;
