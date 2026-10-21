import { type AnchorHTMLAttributes, type FC, type ReactNode } from 'react';

const panelClasses = [
    'invisible absolute z-20 opacity-0 transition-opacity duration-150',
    'group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100',
    'flex flex-col gap-px bg-base-100 rounded-lg shadow-sm p-1',
].join(' ');

interface DropdownMenuProps {
    trigger: ReactNode;
    children: ReactNode;
    panelClassName?: string;
    className?: string;
}

export const DropdownMenu: FC<DropdownMenuProps> = ({
    trigger,
    children,
    panelClassName = 'top-full left-0',
    className = '',
}) => (
    <div className={`relative group ${className}`.trim()}>
        {trigger}
        <ul className={`${panelClasses} ${panelClassName}`}>{children}</ul>
    </div>
);

const itemClasses =
    'flex items-center gap-2 px-3 py-1.5 rounded text-sm cursor-pointer hover:bg-base-200 hover:no-underline';

type DropdownMenuItemProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
};

export const DropdownMenuItem: FC<DropdownMenuItemProps> = ({ className = '', children, ...props }) => (
    <li>
        <a className={`${itemClasses} ${className}`.trim()} {...props}>
            {children}
        </a>
    </li>
);
