import React from 'react';

import { NavigationTab } from './NavigationTab';
import type { Organism } from '../../config';
import { routes } from '../../routes/routes';
import { DropdownMenu, DropdownMenuItem } from '../common/DropdownMenu';

interface OrganismNavigationProps {
    currentOrganism?: Organism;
    knownOrganisms: Organism[];
}

export const OrganismNavigation: React.FC<OrganismNavigationProps> = ({ currentOrganism, knownOrganisms }) => {
    const displayName = 'Organisms';

    return (
        <DropdownMenu
            id='organism-menu'
            panelId='organism-menu-items'
            panelClassName='w-56'
            trigger={
                <NavigationTab
                    isActive={!!currentOrganism}
                    className='group data-open:bg-transparent data-open:text-slate-600 data-open:border-transparent data-open:hover:bg-transparent data-open:hover:text-slate-600 data-open:hover:border-transparent'
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
                </NavigationTab>
            }
        >
            {knownOrganisms.map((organism) => {
                const isActive = currentOrganism?.key === organism.key;

                return (
                    <DropdownMenuItem
                        key={organism.key}
                        href={routes.searchPage(organism.key)}
                        className={`gap-3 ${isActive ? 'bg-primary-100 data-focus:bg-primary-100 text-gray-900 font-semibold' : 'text-gray-700'}`}
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
                    </DropdownMenuItem>
                );
            })}
        </DropdownMenu>
    );
};
