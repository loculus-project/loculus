import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import React from 'react';

import { NavigationTab } from './NavigationTab';
import type { Organism } from '../../config';
import { routes } from '../../routes/routes';

interface OrganismNavigationProps {
    currentOrganism?: Organism;
    knownOrganisms: Organism[];
}

export const OrganismNavigation: React.FC<OrganismNavigationProps> = ({ currentOrganism, knownOrganisms }) => {
    const displayName = 'Organisms';

    return (
        <Menu as='div' className='group relative' id='organism-menu'>
            <MenuButton
                as={NavigationTab}
                isActive={!!currentOrganism}
                className='group group-data-open:bg-transparent group-data-open:text-slate-600 group-data-open:border-transparent group-data-open:hover:bg-transparent group-data-open:hover:text-slate-600 group-data-open:hover:border-transparent'
            >
                <span>{displayName}</span>
                {currentOrganism && (
                    <span className='hidden lg:inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-primary-50 text-primary-700 border border-primary-200'>
                        {currentOrganism.displayName}
                    </span>
                )}
                <svg
                    className='w-4 h-4 transition-transform group-data-open:rotate-180'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                    aria-hidden='true'
                >
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 9l-7 7-7-7' />
                </svg>
            </MenuButton>

            {/*
             * `anchor` positions the panel with floating-ui, which keeps it inside the viewport and caps its
             * height (making it scrollable) when there isn't enough room below the button. Without it, the list
             * runs off the bottom of short windows, and the page can't be scrolled while the menu is open.
             * Prevents: https://github.com/loculus-project/loculus/issues/7388
             */}
            <MenuItems
                anchor={{ to: 'bottom start', gap: 4, padding: 8 }}
                transition
                className='w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50 focus:outline-hidden origin-top transition ease-out duration-100 data-closed:scale-95 data-closed:opacity-0 data-leave:duration-75 data-leave:ease-in'
            >
                <div className='py-1'>
                    {knownOrganisms.map((organism) => {
                        const isActive = currentOrganism?.key === organism.key;

                        return (
                            <MenuItem key={organism.key}>
                                {({ focus }) => {
                                    const baseClasses = 'flex items-center gap-3 px-4 py-2 text-sm transition-colors';
                                    const stateClasses = isActive
                                        ? 'bg-primary-100 text-gray-900 font-semibold'
                                        : 'text-gray-700';
                                    const focusClasses = focus && !isActive ? 'bg-gray-50 text-gray-900' : '';

                                    const className = `${baseClasses} ${stateClasses} ${focusClasses}`.trim();

                                    return (
                                        <a
                                            href={routes.searchPage(organism.key)}
                                            className={className}
                                            aria-current={isActive ? 'page' : undefined}
                                        >
                                            {organism.image ? (
                                                <img
                                                    src={organism.image}
                                                    alt=''
                                                    className='w-5 h-5 rounded-full object-cover shrink-0'
                                                    onError={(e) => {
                                                        e.currentTarget.classList.add('invisible');
                                                    }}
                                                />
                                            ) : (
                                                <div className='w-5 h-5 shrink-0' />
                                            )}
                                            <span>{organism.displayName}</span>
                                        </a>
                                    );
                                }}
                            </MenuItem>
                        );
                    })}
                </div>
            </MenuItems>
        </Menu>
    );
};
