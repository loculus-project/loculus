import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import {
    type AnchorHTMLAttributes,
    type FC,
    Fragment,
    type ReactElement,
    type ReactNode,
    useEffect,
    useState,
} from 'react';

type DropdownAlign = 'start' | 'center' | 'end';

const anchorTo: Record<DropdownAlign, 'bottom start' | 'bottom' | 'bottom end'> = {
    start: 'bottom start',
    center: 'bottom',
    end: 'bottom end',
};

const panelClasses = [
    'z-50 flex flex-col gap-px p-1 bg-white rounded-lg shadow-lg border border-gray-200 focus:outline-hidden',
    // Headless UI caps the anchored panel to the space below the trigger and makes it scroll; this keeps
    // a scroll at the end of the list from scrolling the page behind it.
    'overscroll-contain',
    'origin-top transition ease-out duration-100 data-closed:scale-95 data-closed:opacity-0 data-leave:duration-75 data-leave:ease-in',
].join(' ');

/**
 * Whether the element has more content below its visible area. The anchored menu panel gets its max-height
 * from floating-ui after it mounts, so this is recomputed when the panel resizes as well as when it scrolls.
 */
const useCanScrollDown = (element: HTMLElement | null) => {
    const [canScrollDown, setCanScrollDown] = useState(false);

    useEffect(() => {
        if (element === null) return;
        const update = () => setCanScrollDown(element.scrollTop + element.clientHeight < element.scrollHeight - 1);
        update();
        element.addEventListener('scroll', update, { passive: true });
        const resizeObserver = new ResizeObserver(update);
        resizeObserver.observe(element);
        return () => {
            element.removeEventListener('scroll', update);
            resizeObserver.disconnect();
        };
    }, [element]);

    return canScrollDown;
};

interface DropdownMenuProps {
    /**
     * The element that opens the menu. It must be a single element that forwards its ref to a button
     * (e.g. `Button` or `NavigationTab`); Headless UI attaches the click and keyboard handlers to it.
     */
    trigger: ReactElement;
    children: ReactNode;
    /** Where the panel sits relative to the trigger. */
    align?: DropdownAlign;
    panelClassName?: string;
    className?: string;
    id?: string;
    panelId?: string;
}

/**
 * A click-to-open menu that is anchored below its trigger and scrolls when it would otherwise run off the
 * screen. Built on Headless UI's `Menu`, so it is keyboard navigable and closes on escape or outside click.
 */
export const DropdownMenu: FC<DropdownMenuProps> = ({
    trigger,
    children,
    align = 'start',
    panelClassName = '',
    className = '',
    id,
    panelId,
}) => {
    const [panelElement, setPanelElement] = useState<HTMLElement | null>(null);
    const canScrollDown = useCanScrollDown(panelElement);

    return (
        <Menu as='div' className={`group ${className}`.trim()} id={id}>
            <MenuButton as={Fragment}>{trigger}</MenuButton>
            <MenuItems
                ref={setPanelElement}
                id={panelId}
                anchor={{ to: anchorTo[align], gap: 4, padding: 8 }}
                transition
                className={`${panelClasses} ${panelClassName}`.trim()}
            >
                {children}
                {/* Fades out the bottom of the list while there is more to scroll to, hinting that it scrolls. */}
                <div
                    aria-hidden='true'
                    className={`pointer-events-none sticky bottom-0 shrink-0 -mt-10 h-10 bg-linear-to-t from-white transition-opacity duration-150 ${canScrollDown ? 'opacity-100' : 'opacity-0'}`}
                />
            </MenuItems>
        </Menu>
    );
};

const itemClasses =
    'flex items-center gap-2 px-3 py-1.5 rounded text-sm cursor-pointer data-focus:bg-base-200 hover:no-underline';

type DropdownMenuItemProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
};

export const DropdownMenuItem: FC<DropdownMenuItemProps> = ({ className = '', children, ...props }) => (
    <MenuItem>
        <a className={`${itemClasses} ${className}`.trim()} {...props}>
            {children}
        </a>
    </MenuItem>
);
