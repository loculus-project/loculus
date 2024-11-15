import type { FC } from 'react';

import { useOffCanvas } from '../../hooks/useOffCanvas';
import { navigationItems, type TopNavigationItems } from '../../routes/navigationItems';
import { OffCanvasOverlay } from '../OffCanvasOverlay';
import { SandwichIcon } from '../SandwichIcon';

type SandwichMenuProps = {
    topNavigationItems: TopNavigationItems;
    gitHubMainUrl: string | undefined;
};

export const SandwichMenu: FC<SandwichMenuProps> = ({ topNavigationItems, gitHubMainUrl }) => {
    const { isOpen, toggle: toggleMenu, close: closeMenu } = useOffCanvas();

    return (
        <div className='relative'>
            {!isOpen ? (
                <button className='absolute z-50 bg-transparent border-none cursor-pointer' onClick={toggleMenu}>
                    <SandwichIcon isOpen={isOpen} />
                </button>
            ) : (
                <OffCanvasOverlay onClick={closeMenu} />
            )}

            <div
                className={`fixed top-0 right-0 bg-white w-64 min-h-screen flex flex-col offCanvasTransform ${
                    isOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                <button
                    className='absolute z-50 bg-transparent border-none cursor-pointer right-3 top-4'
                    onClick={toggleMenu}
                >
                    <SandwichIcon isOpen={isOpen} />
                </button>
                <div className='font-bold p-5 flex flex-col justify-between min-h-screen max-h-screen overflow-y-auto'>
                    <div>
                        <div className='h-10'>
                            <a href='/'>Loculus</a>
                        </div>
                        <div className='flex-grow divide-y-2 divide-gray-300 divide-solid border-t-2 border-b-2 border-gray-300 border-solid '>
                            {topNavigationItems.map(({ text, path }) => (
                                <OffCanvasNavItem key={path} text={text} level={1} path={path} />
                            ))}
                        </div>
                    </div>

                    <div className='mt-auto mb-10'>
                        <div className='flex justify-end items-center py-5'>
                            <a
                                href={
                                    gitHubMainUrl !== undefined ? gitHubMainUrl : 'https://github.com/loculus-project'
                                }
                            >
                                <img src='/github-mark.svg' className='w-8' alt='GitHub logo' />
                            </a>
                        </div>

                        <div className='font-light divide-y-2 divide-gray-300 divide-solid border-t-2 border-b-2 border-gray-300 border-solid '>
                            {navigationItems.bottom.map(({ text, path }) => (
                                <OffCanvasNavItem key={path} text={text} level={1} path={path} type='small' />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

type IndentLevel = 1 | 2;

type OffCanvasNavItemProps = {
    text: string;
    path: string | false;
    level: IndentLevel;
    type?: 'small';
};

const OffCanvasNavItem: FC<OffCanvasNavItemProps> = ({ text, level, path, type }) => {
    const height = type === 'small' ? 'py-1' : 'py-3';

    const indent: { [K in IndentLevel]: string } = {
        1: 'ml-4',
        2: 'ml-8',
    };

    return (
        <div>
            <div className='flex items-center'>
                <div className={`${indent[level]} ${height}`}>{path === false ? text : <a href={path}> {text}</a>}</div>
            </div>
        </div>
    );
};
