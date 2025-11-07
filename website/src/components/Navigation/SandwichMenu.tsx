import type { FC } from 'react';

import type { Organism } from '../../config';
import { useOffCanvas } from '../../hooks/useOffCanvas';
import { navigationItems, type TopNavigationItems } from '../../routes/navigationItems';
import { routes } from '../../routes/routes';
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
            <button className='relative z-50 p-2 -m-2' onClick={toggleMenu} aria-label='Open main menu'>
                <SandwichIcon isOpen={isOpen} />
            </button>
            {isOpen && <OffCanvasOverlay onClick={closeMenu} />}

            <div
                className={`fixed top-0 right-0 z-50 w-64 min-h-screen bg-white flex flex-col transition-transform duration-300 ${
                    isOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                <button className='absolute z-50 right-3 top-4 p-2' onClick={toggleMenu} aria-label='Close main menu'>
                    <SandwichIcon isOpen={isOpen} />
                </button>
                <div className='p-5 flex flex-col justify-between min-h-screen overflow-y-auto'>
                    <div>
                        <div className='h-10 font-bold'>
                            <a href='/' className='text-gray-900 hover:text-primary-600 transition-colors'>
                                {siteName}
                            </a>
                        </div>
                        <div className='py-3 pr-2'>
                            <AccessionSearchBox defaultOpen fullWidth onSubmitSuccess={closeMenu} />
                        </div>
                        <div className='flex-grow divide-y-2 divide-gray-300 border-y-2 border-gray-300'>
                            <div className='py-3'>
                                <h3 className='ml-4 mb-3 font-semibold text-gray-700'>Organisms</h3>
                                <div className='ml-4 space-y-1'>
                                    {knownOrganisms.map((organism) => (
                                        <a
                                            key={organism.key}
                                            href={routes.searchPage(organism.key)}
                                            className={`
                                                flex items-center gap-3 py-1.5 transition-colors
                                                ${
                                                    organism === currentOrganism
                                                        ? 'text-primary-600 font-semibold'
                                                        : 'text-gray-700 hover:text-primary-600'
                                                }
                                            `}
                                        >
                                            {organism.image ? (
                                                <img
                                                    src={organism.image}
                                                    alt=''
                                                    className='w-5 h-5 rounded-full object-cover flex-shrink-0'
                                                    onError={(e) => {
                                                        e.currentTarget.classList.add('invisible');
                                                    }}
                                                />
                                            ) : (
                                                <div className='w-5 h-5' />
                                            )}
                                            <span>{organism.displayName}</span>
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

                        <div className='divide-y-2 divide-gray-300 border-y-2 border-gray-300'>
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
    const indent = level === 1 ? 'ml-4' : 'ml-8';
    const padding = type === 'small' ? 'py-1' : 'py-3';

    const className = `
        ${indent} ${padding} block text-base transition-colors
        ${
            path === false
                ? 'text-gray-500 cursor-default'
                : isActive
                  ? 'text-primary-700 font-semibold'
                  : 'text-gray-700 hover:text-primary-600'
        }
    `;

    if (path === false) {
        return <span className={className}>{text}</span>;
    }

    return (
        <a href={path} className={className} aria-current={isActive ? 'page' : undefined}>
            {text}
        </a>
    );
};
