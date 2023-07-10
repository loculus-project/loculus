import React, { type FC, useState } from 'react';

import { SandwichIcon } from './SandwichIcon';

export const SandwichMenu: FC<{ top: number; right: number }> = ({ top, right }) => {
    const [isOpen, setIsOpen] = useState(false);

    const toggleMenu = () => {
        setIsOpen(!isOpen);
    };

    return (
        <div className='relative'>
            <button
                className='fixed top-4 right-7 z-50 bg-transparent border-none cursor-pointer'
                onClick={toggleMenu}
                style={{ top: `${top}px`, right: `${right}px` }}
            >
                <SandwichIcon isOpen={isOpen} />
            </button>

            <div
                className={`fixed inset-0 bg-gray-800 bg-opacity-50 z-40 transition-opacity ${
                    isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                onClick={toggleMenu}
            />

            <div
                className={`fixed top-0 right-0 bg-white w-64 h-screen transform transition-transform duration-300 ease-in-out z-40 ${
                    isOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
                onClick={toggleMenu}
            >
                <div className='font-bold m-5 font-bold flex flex-col justify-between min-h-screen '>
                    <div>
                        <div className='h-10'>
                            <a href='/'>Pathoplexus</a>
                        </div>
                        <div className='flex-grow divide-y-2 divide-gray-300 divide-solid border-t-2 border-b-2 border-gray-300 border-solid'>
                            <OffcanvasNavItem text='Search' url='/search' />
                            <OffcanvasNavItem text='DOI' url='/doi' />
                        </div>
                    </div>

                    <div className='mt-auto mb-10'>
                        <div className='flex justify-end items-center p-2'>
                            <a href='https://github.com/pathoplexus'>
                                <img src='/github-mark.svg' className='w-10' />
                            </a>
                        </div>

                        <div className='font-light divide-y-2 divide-gray-300 divide-solid border-t-2 border-b-2 border-gray-300 border-solid'>
                            <OffcanvasNavItem text='About' url='/about' type='small' />
                            <OffcanvasNavItem text='Api documentation' url='/api_documentation' type='small' />
                            <OffcanvasNavItem text='Governance' url='/governance' type='small' />
                            <OffcanvasNavItem text='Status' url='/status' type='small' />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

type OffcanvasNavItemProps = {
    text: string;
    url?: string;
    type?: 'small';
};

const OffcanvasNavItem = ({ text, url, type }: OffcanvasNavItemProps) => {
    const height = type === 'small' ? 1 : 3;

    let inner = (
        <div className={` flex items-center`}>
            <div className={`pl-4 py-${height}`}>{text}</div>
        </div>
    );
    if (url !== undefined) {
        inner = <a href={url}>{inner}</a>;
    }

    return <div>{inner}</div>;
};
