import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import React from 'react';

import type { LinkMenuItem } from '../../types/config';
import IwwaArrowDown from '~icons/iwwa/arrow-down';

interface LinkWithMenuComponentProps {
    value: string | number | boolean;
    linkMenuItems: LinkMenuItem[];
}

export const LinkWithMenuComponent: React.FC<LinkWithMenuComponentProps> = ({ value, linkMenuItems }) => {

    console.log('LinkWithMenuComponent', { value, linkMenuItems });
    if (linkMenuItems.length === 0) {
        return <span>{value}</span>;
    }

    const primaryLink = linkMenuItems[0];
    const hasMultipleLinks = linkMenuItems.length > 1;

    const generateUrl = (urlTemplate: string) => {
        return urlTemplate.replace('__value__', value.toString());
    };

    if (!hasMultipleLinks) {
        return (
            <a href={generateUrl(primaryLink.url)} target='_blank' rel='noopener noreferrer' className='underline'>
                {value}
            </a>
        );
    }

    return (
        <div className='inline-flex items-center'>
            <a href={generateUrl(primaryLink.url)} target='_blank' rel='noopener noreferrer' className='underline'>
                {value}
            </a>
            <Menu as='div' className='relative inline-block text-left ml-1'>
                <MenuButton className='inline-flex items-center p-1 text-gray-600 hover:text-gray-900'>
                    <IwwaArrowDown className='h-3 w-3' aria-hidden='true' />
                </MenuButton>
                <MenuItems className='absolute left-0 mt-2 w-48 origin-top-left rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10'>
                    <div className='py-1'>
                        {linkMenuItems.map((linkItem) => (
                            <MenuItem key={linkItem.name}>
                                {({ focus }) => (
                                    <a
                                        href={generateUrl(linkItem.url)}
                                        target='_blank'
                                        rel='noopener noreferrer'
                                        className={`
                                            ${focus ? 'bg-gray-100 text-gray-900' : 'text-gray-700'}
                                            block px-4 py-2 text-sm
                                        `}
                                    >
                                        {linkItem.name}
                                    </a>
                                )}
                            </MenuItem>
                        ))}
                    </div>
                </MenuItems>
            </Menu>
        </div>
    );
};
