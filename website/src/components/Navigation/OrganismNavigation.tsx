import { Menu, MenuButton, MenuItems, MenuItem, Transition } from '@headlessui/react';
import React from 'react';
import { Fragment } from 'react';

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
        <Menu as='div' className='relative'>
            <MenuButton as={NavigationTab} isActive={!!currentOrganism} className='group'>
                <span>{displayName}</span>
                {currentOrganism && (
                    <span className='hidden lg:inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-primary-50 text-primary-700 border border-primary-200'>
                        {currentOrganism.displayName}
                    </span>
                )}
                <svg
                    className='w-4 h-4 transition-transform group-data-[open]:rotate-180'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                    aria-hidden='true'
                >
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 9l-7 7-7-7' />
                </svg>
            </MenuButton>

            <Transition
                as={Fragment}
                enter='transition ease-out duration-100'
                enterFrom='transform opacity-0 scale-95'
                enterTo='transform opacity-100 scale-100'
                leave='transition ease-in duration-75'
                leaveFrom='transform opacity-100 scale-100'
                leaveTo='transform opacity-0 scale-95'
            >
                <MenuItems className='absolute left-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50 focus:outline-none'>
                    <div className='py-1'>
                        {knownOrganisms.map((organism) => {
                            const isActive = currentOrganism?.key === organism.key;

                            return (
                                <MenuItem key={organism.key}>
                                    {({ focus }) => {
                                        const baseClasses =
                                            'flex items-center gap-3 px-4 py-2 text-sm transition-colors';
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
                                                        className='w-5 h-5 rounded-full object-cover flex-shrink-0'
                                                        onError={(e) => {
                                                            e.currentTarget.classList.add('invisible');
                                                        }}
                                                    />
                                                ) : (
                                                    <div className='w-5 h-5 flex-shrink-0' />
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
            </Transition>
        </Menu>
    );
};
