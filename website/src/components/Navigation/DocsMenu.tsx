import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react';
import type { MDXInstance } from 'astro';
import React from 'react';

import XIcon from '~icons/material-symbols/close';
import MenuIcon from '~icons/material-symbols/menu';

type Page = MDXInstance<Record<string, any>>;

interface DocsMenuProps {
    docsPages: MDXInstance<Record<string, any>>[];
    currentPageUrl: string;
    title: string;
}

const groupPagesByDirectory = (pages: Page[]): Record<string, Page[]> => {
    const groupedPages: Record<string, Page[]> = {};
    const indexPages: Record<string, Page> = {};

    pages.forEach((page) => {
        const pathParts = page.url !== undefined ? page.url.split('/') : [''];
        const dir = pathParts.slice(2, -1).join('/');
        const fileName = pathParts[pathParts.length - 1];

        if (fileName === 'index') {
            indexPages[dir] = page;
        } else {
            if (groupedPages.hasOwnProperty(dir) === false) {
                groupedPages[dir] = [];
            }
            groupedPages[dir].push(page);
        }
    });

    Object.keys(groupedPages).forEach((dir) => {
        groupedPages[dir].sort((a, b) => {
            const orderA = a.frontmatter.order ?? 0;
            const orderB = b.frontmatter.order ?? 0;
            if (orderA !== orderB) {
                return orderA - orderB;
            }
            return a.frontmatter.title.localeCompare(b.frontmatter.title);
        });
    });

    return { groupedPages, indexPages };
};

const toTitleCase = (str: string): string => {
    return str.replace(/\b\w/g, (char) => char.toUpperCase());
};

const DocsMenu: React.FC<DocsMenuProps> = ({ docsPages, currentPageUrl, title }) => {
    const { groupedPages, indexPages } = groupPagesByDirectory(docsPages);

    return (
        <Disclosure as='nav' className='docs-menu bg-white border rounded-lg overflow-hidden mt-5 sticky sm:min-w-64'>
            {({ open }) => (
                <>
                    <div className='flex items-center justify-between px-4 py-3 bg-gray-100'>
                        <div className='text-lg font-semibold text-primary-600'>{title}</div>
                        <div className='sm:hidden'>
                            <DisclosureButton className='text-primary-600 hover:text-primary-800 focus:outline-none'>
                                {open ? (
                                    <XIcon className='w-6 h-6' aria-hidden='true' />
                                ) : (
                                    <MenuIcon className='w-6 h-6' aria-hidden='true' />
                                )}
                            </DisclosureButton>
                        </div>
                    </div>

                    <DisclosurePanel className='sm:hidden'>
                        <ul className='list-none m-0 p-0'>
                            {Object.entries(groupedPages).map(([dir, pages]) => (
                                <li key={dir} className='border-b border-gray-200 last:border-0'>
                                    <div className='p-4 text-primary-600 font-semibold bg-gray-100'>
                                        {indexPages[dir] ? (
                                            <a
                                                href={indexPages[dir].url}
                                                className={`block text-primary-600 hover:text-primary-800 ${
                                                    indexPages[dir].url === currentPageUrl ? 'font-bold' : ''
                                                }`}
                                            >
                                                {toTitleCase(dir.replaceAll('-', ' '))}
                                            </a>
                                        ) : (
                                            toTitleCase(dir.replaceAll('-', ' '))
                                        )}
                                    </div>
                                    <ul className='list-none m-0 p-0'>
                                        {pages.map((page) => (
                                            <li key={page.url} className='border-b border-gray-200 last:border-0'>
                                                <a
                                                    href={page.url}
                                                    className={`block p-4 py-2 text-primary-600 hover:bg-blue-50 transition-colors duration-150 ease-in-out ${
                                                        page.url === currentPageUrl ? 'font-bold' : ''
                                                    }`}
                                                >
                                                    {page.frontmatter.title}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </li>
                            ))}
                        </ul>
                    </DisclosurePanel>

                    <div className='hidden sm:block'>
                        <ul className='list-none m-0 p-0'>
                            {Object.entries(groupedPages).map(([dir, pages]) => (
                                <li key={dir} className='border-b border-gray-200 last:border-0'>
                                    <div className='p-4 text-primary-600 font-semibold bg-gray-100'>
                                        {indexPages[dir] ? (
                                            <a
                                                href={indexPages[dir].url}
                                                className={`block text-primary-600 hover:text-primary-800 ${
                                                    indexPages[dir].url === currentPageUrl ? 'font-bold' : ''
                                                }`}
                                            >
                                                {toTitleCase(dir.replaceAll('-', ' '))}
                                            </a>
                                        ) : (
                                            toTitleCase(dir.replaceAll('-', ' '))
                                        )}
                                    </div>
                                    <ul className='list-none m-0 p-0'>
                                        {pages.map((page) => (
                                            <li key={page.url} className='border-b border-gray-200 last:border-0'>
                                                <a
                                                    href={page.url}
                                                    className={`block p-4 py-3 text-primary-600 hover:bg-blue-50 transition-colors duration-150 ease-in-out ${
                                                        page.url === currentPageUrl ? 'font-bold' : ''
                                                    }`}
                                                >
                                                    {page.frontmatter.title}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </li>
                            ))}
                        </ul>
                    </div>
                </>
            )}
        </Disclosure>
    );
};

export default DocsMenu;