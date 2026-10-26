import { type AnchorHTMLAttributes, type CSSProperties, type FC, type ReactNode, useId } from 'react';

const panelClasses = [
    'invisible absolute top-full z-20 opacity-0 transition-opacity duration-150',
    'group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100',
    'flex flex-col gap-px bg-base-100 rounded-lg shadow-sm p-1',
    'max-h-[75vh] overflow-y-auto overscroll-contain',
    // Where anchor positioning is supported, fit the panel to the space below the trigger
    'supports-[position-area:bottom]:fixed supports-[position-area:bottom]:inset-auto supports-[position-area:bottom]:max-h-full',
    'supports-[position-area:bottom]:[position-anchor:var(--dropdown-anchor)]',
    'supports-[position-area:bottom]:[position-try-fallbacks:flip-inline]',
].join(' ');

type DropdownAlign = 'start' | 'center' | 'end';

const alignClasses: Record<DropdownAlign, string> = {
    start: 'left-0 -ml-4 supports-[position-area:bottom]:[position-area:bottom_span-right]',
    center: [
        'left-1/2 -translate-x-1/2 supports-[position-area:bottom]:translate-x-0',
        'supports-[position-area:bottom]:[position-area:bottom_span-all] supports-[position-area:bottom]:[justify-self:anchor-center]',
    ].join(' '),
    end: 'right-0 -mr-4 supports-[position-area:bottom]:[position-area:bottom_span-left]',
};

interface DropdownMenuProps {
    trigger: ReactNode;
    children: ReactNode;
    align?: DropdownAlign;
    panelClassName?: string;
    className?: string;
}

export const DropdownMenu: FC<DropdownMenuProps> = ({
    trigger,
    children,
    align = 'start',
    panelClassName = '',
    className = '',
}) => {
    const anchorName = `--dropdown-${useId().replace(/:/g, '')}`;
    return (
        <div
            className={`relative group [anchor-name:var(--dropdown-anchor)] ${className}`.trim()}
            style={{ '--dropdown-anchor': anchorName } as CSSProperties} // eslint-disable-line @typescript-eslint/naming-convention
        >
            {trigger}
            <ul className={`${panelClasses} ${alignClasses[align]} ${panelClassName}`}>{children}</ul>
        </div>
    );
};

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
