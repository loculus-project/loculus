import React from 'react';
import { Menu, MenuButton, MenuItems, MenuItem, Transition } from '@headlessui/react';
import { Fragment } from 'react';

import type { Organism } from '../../config';

interface OrganismNavigationProps {
    currentOrganism?: Organism;
    knownOrganisms: Organism[];
}

export const OrganismNavigation: React.FC<OrganismNavigationProps> = ({ currentOrganism, knownOrganisms }) => {
    const displayName = currentOrganism ? currentOrganism.displayName : 'Organisms';

    return (
        <Menu as='div' className='relative'>
            <MenuButton className='group flex items-center gap-2 px-2 py-1 rounded transition-colors hover:bg-gray-100'>
                {currentOrganism?.image && (
                    <div className='w-5 h-5 rounded-full bg-gray-200 overflow-hidden flex-shrink-0'>
                        <img
                            src={currentOrganism.image}
                            alt={currentOrganism.displayName}
                            className='w-full h-full object-cover'
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                            }}
                        />
                    </div>
                )}
                <span>{displayName}</span>
                <svg
                    className='w-4 h-4 transition-transform group-data-[open]:rotate-180'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
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
                <MenuItems className='absolute top-full mt-1 left-0 bg-white rounded-lg shadow-lg border border-gray-200 min-w-[220px] z-50 focus:outline-none'>
                    <div className='py-1'>
                        {knownOrganisms.map((organism) => (
                            <MenuItem key={organism.key}>
                                {({ focus }) => (
                                    <a
                                        href={`/${organism.key}/search`}
                                        className={`flex items-center gap-3 px-4 py-2 transition-colors ${
                                            focus ? 'bg-gray-50' : ''
                                        }`}
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
                                            <div className='w-5 h-5 flex-shrink-0' />
                                        )}
                                        <span className='text-sm text-gray-700'>{organism.displayName}</span>
                                        {organism === currentOrganism && (
                                            <span className='ml-auto text-primary-600'>✓</span>
                                        )}
                                    </a>
                                )}
                            </MenuItem>
                        ))}
                    </div>
                </MenuItems>
            </Transition>
        </Menu>
    );
};
