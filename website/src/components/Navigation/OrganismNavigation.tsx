import React, { useState, useRef, useEffect } from 'react';

import type { Organism } from '../../config';

interface OrganismNavigationProps {
    currentOrganism?: Organism;
    knownOrganisms: Organism[];
}

export const OrganismNavigation: React.FC<OrganismNavigationProps> = ({ currentOrganism, knownOrganisms }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const displayName = currentOrganism ? currentOrganism.displayName : 'Organisms';

    return (
        <div className='relative' ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className='flex items-center gap-2 px-2 py-1 rounded transition-colors hover:bg-gray-100'
            >
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
                    className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                >
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 9l-7 7-7-7' />
                </svg>
            </button>

            {isOpen && (
                <div className='absolute top-full mt-1 left-0 bg-white rounded-lg shadow-lg border border-gray-200 min-w-[220px] z-50'>
                    <div className='py-1'>
                        {knownOrganisms.map((organism) => (
                            <a
                                key={organism.key}
                                href={`/${organism.key}/search`}
                                className='flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors'
                                onClick={() => setIsOpen(false)}
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
                                {organism === currentOrganism && <span className='ml-auto text-primary-600'>✓</span>}
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
