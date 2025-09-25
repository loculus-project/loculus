import { Menu, MenuButton, MenuItems, MenuItem, Transition } from '@headlessui/react';
import React from 'react';
import { Fragment } from 'react';

import type { Organism } from '../../config';

interface OrganismNavigationProps {
    currentOrganism?: Organism;
    knownOrganisms: Organism[];
    isDataBrowsePage?: boolean;
}

export const OrganismNavigation: React.FC<OrganismNavigationProps> = ({
    currentOrganism,
    knownOrganisms,
    isDataBrowsePage = false,
}) => {
    const displayName = isDataBrowsePage
        ? 'Switch Organism'
        : currentOrganism !== undefined
          ? 'Organisms'
          : 'Browse/Submit';
    const isOrganismSelected = currentOrganism !== undefined && !isDataBrowsePage;

    return (
        <Menu as='div' className='relative'>
            <MenuButton
                className={`group flex items-center gap-1 px-4 pt-2.5 pb-1.5 text-sm font-medium transition-colors duration-150 rounded-t-lg border border-transparent border-b-2 ${
                    isOrganismSelected
                        ? 'bg-white text-slate-900 border-slate-200 border-b-primary-400 shadow-[0_6px_12px_-8px_rgba(15,23,42,0.25)]'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 hover:border-slate-200'
                }`}
                aria-current={isOrganismSelected ? 'page' : undefined}
            >
                <span>{displayName}</span>
                {currentOrganism !== undefined && (
                    <span className='hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 text-xs font-medium border border-primary-200'>
                        {currentOrganism.displayName}
                    </span>
                )}
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
                        {knownOrganisms.map((organism) => {
                            const isActive = currentOrganism?.key === organism.key;

                            return (
                                <MenuItem key={organism.key}>
                                    {({ focus }) => {
                                        const baseClasses =
                                            'flex items-center gap-3 px-4 py-2 text-sm transition-colors';
                                        const stateClasses = isActive
                                            ? 'bg-primary-100 text-gray-900 font-semibold'
                                            : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50';
                                        const focusClasses = focus ? (isActive ? 'bg-primary-100' : 'bg-gray-50') : '';

                                        return (
                                            <a
                                                href={`/${organism.key}/search`}
                                                className={`${baseClasses} ${stateClasses} ${focusClasses}`}
                                                aria-current={isActive ? 'page' : undefined}
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
                                                <span className='text-sm'>{organism.displayName}</span>
                                                {isActive && (
                                                    <span className='ml-auto text-primary-600 font-bold'>✓</span>
                                                )}
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
