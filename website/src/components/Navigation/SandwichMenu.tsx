import type { FC } from 'react';

import type { Organism } from '../../config';
import { useOffCanvas } from '../../hooks/useOffCanvas';
import { navigationItems, type TopNavigationItems } from '../../routes/navigationItems';
import { OffCanvasOverlay } from '../OffCanvasOverlay';
import { SandwichIcon } from '../SandwichIcon';
import AccessionSearchBox from './AccessionSearchBox';

type SandwichMenuProps = {
    topNavigationItems: TopNavigationItems;
    currentOrganism?: Organism;
    knownOrganisms: Organism[];
    gitHubMainUrl: string | undefined;
    siteName: string;
    activeTopNavigationItem?: string;
};

export const SandwichMenu: FC<SandwichMenuProps> = ({
    topNavigationItems,
    currentOrganism,
    knownOrganisms,
    gitHubMainUrl,
    siteName,
    activeTopNavigationItem,
}) => {
    const { isOpen, toggle: toggleMenu, close: closeMenu } = useOffCanvas();

    return (
        <div className='relative'>
            {!isOpen ? (
                <button
                    className='z-50 bg-transparent border-none cursor-pointer'
                    onClick={toggleMenu}
                    aria-label='Open main menu'
                >
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
                    aria-label='Close main menu'
                >
                    <SandwichIcon isOpen={isOpen} />
                </button>
                <div className='font-bold p-5 flex flex-col justify-between min-h-screen max-h-screen overflow-y-auto'>
                    <div>
                        <div className='h-10'>
                            <a href='/'>{siteName}</a>
                        </div>
                        <div className='py-3 pr-2'>
                            <AccessionSearchBox defaultOpen fullWidth onSubmitSuccess={closeMenu} />
                        </div>
                        <div className='flex-grow divide-y-2 divide-gray-300 divide-solid border-t-2 border-b-2 border-gray-300 border-solid '>
                            <div className='py-3'>
                                <div className='ml-4 font-semibold text-gray-700 mb-3'>Organisms</div>
                                <div className='ml-4 space-y-2'>
                                    {knownOrganisms.map((organism) => (
                                        <a
                                            key={organism.key}
                                            href={`/${organism.key}/search`}
                                            className='flex items-center gap-3 py-1 text-gray-700 hover:text-primary-600'
                                        >
                                            {organism.image ? (
                                                <div className='w-5 h-5 rounded-full bg-gray-200 overflow-hidden flex-shrink-0'>
                                                    <img
                                                        src={organism.image}
                                                        alt={organism.displayName}
                                                        className='w-full h-full object-cover'
                                                        onError={(e) => {
                                                            e.currentTarget.style.display = 'none';
                                                        }}
                                                    />
                                                </div>
                                            ) : (
                                                <div className='w-5 h-5' />
                                            )}
                                            <span>{organism.displayName}</span>
                                            {organism === currentOrganism && (
                                                <span className='ml-auto mr-4 text-primary-600'>✓</span>
                                            )}
                                        </a>
                                    ))}
                                </div>
                            </div>
                            {topNavigationItems.map(({ text, path, id }) => (
                                <OffCanvasNavItem
                                    key={path}
                                    text={text}
                                    level={1}
                                    path={path}
                                    isActive={
                                        activeTopNavigationItem !== undefined &&
                                        (id === activeTopNavigationItem ||
                                            (id === undefined && activeTopNavigationItem === path))
                                    }
                                />
                            ))}
                        </div>
                    </div>

                    <div className='mt-auto mb-10'>
                        <div className='flex justify-end items-center py-5'>
                            <a href={gitHubMainUrl ?? 'https://github.com/loculus-project'}>
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
    isActive?: boolean;
};

const OffCanvasNavItem: FC<OffCanvasNavItemProps> = ({ text, level, path, type, isActive = false }) => {
    const height = type === 'small' ? 'py-1' : 'py-3';

    const indent: { [K in IndentLevel]: string } = {
        1: 'ml-4',
        2: 'ml-8',
    };

    const baseClass = `${indent[level]} ${height} block text-base transition-colors duration-150`;
    const interactiveClass =
        path === false
            ? `${baseClass} text-gray-500`
            : `${baseClass} ${isActive ? 'text-primary-700 font-semibold' : 'text-gray-700 hover:text-primary-600'}`;

    return (
        <div>
            <div className='flex items-center'>
                {path === false ? (
                    <span className={interactiveClass}>{text}</span>
                ) : (
                    <a href={path} className={interactiveClass} aria-current={isActive ? 'page' : undefined}>
                        {text}
                    </a>
                )}
            </div>
        </div>
    );
};
