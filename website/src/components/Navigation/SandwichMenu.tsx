import type { FC } from 'react';

import { useOffCanvas } from '../../hooks/useOffCanvas';
import { OffCanvasOverlay } from '../OffCanvasOverlay';
import { SandwichIcon } from '../SandwichIcon';
import { navigationItems } from '../../routes.ts';

export const SandwichMenu: FC<{ top: number; right: number }> = ({ top, right }) => {
    const { isOpen, toggle: toggleMenu, close: closeMenu } = useOffCanvas();

    return (
        <div className='relative'>
            <button
                className='fixed z-50 bg-transparent border-none cursor-pointer'
                onClick={toggleMenu}
                style={{ top: `${top}px`, right: `${right}px` }}
            >
                <SandwichIcon isOpen={isOpen} />
            </button>

            {isOpen && <OffCanvasOverlay onClick={closeMenu} />}

            <div
                className={`fixed top-0 right-0 bg-white w-64 min-h-screen flex flex-col offCanvasTransform ${
                    isOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                <div className='font-bold m-5 flex flex-col justify-between min-h-screen flex-grow'>
                    <div>
                        <div className='h-10'>
                            <a href='/'>Pathoplexus</a>
                        </div>
                        <div className='flex-grow divide-y-2 divide-gray-300 divide-solid border-t-2 border-b-2 border-gray-300 border-solid '>
                            {navigationItems.top.map(({ text, path }) => (
                                <OffCanvasNavItem key={path} text={text} path={path} />
                            ))}
                        </div>
                    </div>

                    <div className='mt-auto mb-10'>
                        <div className='flex justify-end items-center py-5'>
                            <a href='https://github.com/pathoplexus'>
                                <img src='/github-mark.svg' className='w-8' alt='GitHub logo' />
                            </a>
                        </div>

                        <div className='font-light divide-y-2 divide-gray-300 divide-solid border-t-2 border-b-2 border-gray-300 border-solid '>
                            {navigationItems.bottom.map(({ text, path }) => (
                                <OffCanvasNavItem key={path} text={text} path={path} type='small' />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

type OffCanvasNavItemProps = {
    text: string;
    path: string;
    type?: 'small';
};

const OffCanvasNavItem: FC<OffCanvasNavItemProps> = ({ text, path, type }) => {
    const height = type === 'small' ? 'py-1' : 'py-3';

    return (
        <div>
            <a href={path}>
                <div className={` flex items-center`}>
                    <div className={`pl-4 ${height} `}>{text}</div>
                </div>
            </a>
        </div>
    );
};
