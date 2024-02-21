import type { FC } from 'react';

import type { Organism } from '../../config.ts';
import { useOffCanvas } from '../../hooks/useOffCanvas';
import { navigationItems, routes } from '../../routes.ts';
import { OffCanvasOverlay } from '../OffCanvasOverlay';
import { SandwichIcon } from '../SandwichIcon';

type SandwichMenuProps = {
    top: number;
    right: number;
    organism: Organism | undefined;
    knownOrganisms: Organism[];
};

export const SandwichMenu: FC<SandwichMenuProps> = ({ top, right, organism, knownOrganisms }) => {
    const { isOpen, toggle: toggleMenu, close: closeMenu } = useOffCanvas();

    return (
        <div className='relative'>
            <button
                className='absolute z-50 bg-transparent border-none cursor-pointer'
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
                            <a href='/'>Loculus</a>
                        </div>
                        <div className='flex-grow divide-y-2 divide-gray-300 divide-solid border-t-2 border-b-2 border-gray-300 border-solid '>
                            <OffCanvasNavItem key='organism-selector' text='Select organism' level={1} path={false} />
                            {knownOrganisms.map((organism) => (
                                <OffCanvasNavItem
                                    key={organism.key}
                                    text={organism.displayName}
                                    level={2}
                                    path={routes.organismStartPage(organism.key)}
                                />
                            ))}
                            {navigationItems.top(organism?.key).map(({ text, path }) => (
                                <OffCanvasNavItem key={path} text={text} level={1} path={path} />
                            ))}
                        </div>
                    </div>

                    <div className='mt-auto mb-10'>
                        <div className='flex justify-end items-center py-5'>
                            <a href='https://github.com/loculus-project'>
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

type OffCanvasNavItemProps = {
    text: string;
    path: string | false;
    level: 1 | 2;
    type?: 'small';
};

const OffCanvasNavItem: FC<OffCanvasNavItemProps> = ({ text, level, path, type }) => {
    const height = type === 'small' ? 'py-1' : 'py-3';

    return (
        <div>
            <div className='flex items-center'>
                <div className={`ml-${4 * level} ${height}`}>{path === false ? text : <a href={path}> {text}</a>}</div>
            </div>
        </div>
    );
};
