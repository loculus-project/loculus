import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react';
import type { MDXInstance } from 'astro';
import React from 'react';

import XIcon from '~icons/material-symbols/close';
import MenuIcon from '~icons/material-symbols/menu';

type Page = MDXInstance<Record<string, any>>;

interface DocsMenuProps {
    docsPages: Page[];
    currentPageUrl: string;
    title: string;
}

interface GroupedPages {
    groupedPages: Record<string, Page[]>;
    indexPages: Record<string, Page>;
}

const groupPagesByDirectory = (pages: Page[]): GroupedPages => {
    const groupedPages: Record<string, Page[]> = {};
    const indexPages: Record<string, Page> = {};

    pages.forEach((page) => {
        const fileParts = page.file.split('/');
        const fileName = fileParts[fileParts.length - 1];
        const dir = fileParts[fileParts.length - 2];

        if (fileName === 'index.mdx') {
            indexPages[dir] = page;
        } else {
            if (!(dir in groupedPages)) {
                groupedPages[dir] = [];
            }
            groupedPages[dir].push(page);
        }
    });

    // Sort pages within each directory
    Object.values(groupedPages).forEach((pages) => {
        
        pages.sort((a, b) => {
            console.log("beep",JSON.stringify(a),JSON.stringify(b));
            const orderA = a.frontmatter.order ?? Infinity;
            const orderB = b.frontmatter.order ?? Infinity;
            return orderA !== orderB ? orderA - orderB : a.frontmatter.title.localeCompare(b.frontmatter.title);
        });
    });

    return { groupedPages, indexPages };
};

const toTitleCase = (str: string): string => str.replace(/\b\w/g, (char) => char.toUpperCase());

interface MenuItemProps {
    page: Page;
    currentPageUrl: string;
}

const MenuItem: React.FC<MenuItemProps> = ({ page, currentPageUrl }) => (
    <li className='border-b border-gray-200 last:border-0'>
        <a
            href={page.url}
            className={`block p-4 py-2 sm:py-3 text-primary-600 hover:bg-blue-50 transition-colors duration-150 ease-in-out ${
                page.url === currentPageUrl ? 'font-bold' : ''
            }`}
        >
            {page.frontmatter.menuTitle ?? page.frontmatter.title}
        </a>
    </li>
);

interface MenuSectionProps {
    dir: string;
    pages: Page[];
    indexPage?: Page;
    currentPageUrl: string;
}

const MenuSection: React.FC<MenuSectionProps> = ({ dir, pages, indexPage, currentPageUrl }) => (
    <li className='border-b border-gray-200 last:border-0'>
        <div className='p-4 text-primary-600 font-semibold bg-gray-100'>
            {indexPage ? (
                <a
                    href={indexPage.url}
                    className={`block text-primary-600 hover:text-primary-800 ${
                        indexPage.url === currentPageUrl ? 'font-bold' : ''
                    }`}
                >
                    {indexPage.frontmatter.title}
                </a>
            ) : (
                toTitleCase(dir.replaceAll('-', ' '))
            )}
        </div>
        <ul className='list-none m-0 p-0'>
            {pages.map((page) => (
                <MenuItem key={page.url} page={page} currentPageUrl={currentPageUrl} />
            ))}
        </ul>
    </li>
);

const DocsMenu: React.FC<DocsMenuProps> = ({ docsPages, currentPageUrl, title }) => {
    const { groupedPages, indexPages } = groupPagesByDirectory(docsPages);

    // Sort directories based on index page order
    const sortedDirectories = Object.keys(groupedPages).sort((a, b) => {
        const orderA = (a in indexPages ? indexPages[a].frontmatter.order : undefined) ?? Infinity;
        const orderB = (b in indexPages ? indexPages[b].frontmatter.order : undefined) ?? Infinity;
        return orderA - orderB;
    });

    const menuContent = (
        <ul className='list-none m-0 p-0'>
            {sortedDirectories.map((dir) => (
                <MenuSection
                    key={dir}
                    dir={dir}
                    pages={groupedPages[dir]}
                    indexPage={indexPages[dir]}
                    currentPageUrl={currentPageUrl}
                />
            ))}
        </ul>
    );

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

                    <DisclosurePanel className='sm:hidden'>{menuContent}</DisclosurePanel>

                    <div className='hidden sm:block'>{menuContent}</div>
                </>
            )}
        </Disclosure>
    );
};

export default DocsMenu;
