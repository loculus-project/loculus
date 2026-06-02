import { type AnchorHTMLAttributes, type FC, type ReactNode } from 'react';

/*
 * Hover/focus dropdown menu, replacing daisyUI's `dropdown` + `dropdown-content
 * menu` components. The panel reveals on hover of the container or when focus
 * moves inside it (keyboard), reproducing daisyUI's `dropdown-hover` behaviour.
 *
 *   <DropdownMenu trigger={<label tabIndex={0}>…</label>} panelClassName='top-full -right-32 w-80'>
 *       <DropdownMenuItem href='…'>…</DropdownMenuItem>
 *   </DropdownMenu>
 */
const panelClasses = [
    'invisible absolute z-20 opacity-0 transition-opacity duration-150',
    'group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100',
    'flex flex-col gap-px bg-base-100 rounded-lg shadow-sm p-1',
].join(' ');

interface DropdownMenuProps {
    /** Visible trigger element (give it `tabIndex={0}` to support keyboard focus). */
    trigger: ReactNode;
    children: ReactNode;
    /** Position/width utilities for the panel, e.g. `top-full -right-32 w-80`. */
    panelClassName?: string;
    /** Extra classes for the container. */
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
