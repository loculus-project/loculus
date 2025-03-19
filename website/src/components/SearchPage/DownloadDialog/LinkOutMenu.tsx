import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { type FC, useState } from 'react';

import { type DownloadUrlGenerator, type DownloadOption } from './DownloadUrlGenerator';
import { type SequenceFilter } from './SequenceFilters';
import { processTemplate } from '../../../utils/templateProcessor';
import DashiconsExternal from '~icons/dashicons/external';
import IwwaArrowDown from '~icons/iwwa/arrow-down';

const DATA_TYPES = ['unalignedNucleotideSequences', 'metadata', 'alignedNucleotideSequences'] as const;
type DataType = (typeof DATA_TYPES)[number];

type LinkOut = {
    name: string;
    url: string;
};

type LinkOutMenuProps = {
    downloadUrlGenerator: DownloadUrlGenerator;
    sequenceFilter: SequenceFilter;
    linkOuts: LinkOut[];
};

export const LinkOutMenu: FC<LinkOutMenuProps> = ({ downloadUrlGenerator, sequenceFilter, linkOuts }) => {
    const [isOpen, setIsOpen] = useState(false);

    const generateLinkOutUrl = (linkOut: LinkOut) => {
        // Find all placeholders in the template that match [type] or [type|format] or [type:segment] or [type:segment|format]
        const placeholderRegex = /\[([\w]+)(?:\:([\w]+))?(?:\|([\w]+))?\]/g;
        const placeholders = Array.from(linkOut.url.matchAll(placeholderRegex));

        // Generate URLs for all found placeholders
        const urlMap = placeholders.reduce(
            (acc, match) => {
                const [fullMatch, dataType, segment, dataFormat] = match;

                // Skip if not a valid data type
                if (!DATA_TYPES.includes(dataType as DataType)) {
                    return acc;
                }

                const downloadOption: DownloadOption = {
                    includeOldData: false,
                    includeRestricted: false,
                    dataType: {
                        type: dataType as DataType,
                        segment: segment, // Pass the segment if specified
                    },
                    compression: undefined,
                    dataFormat: dataFormat,
                };

                const { url } = downloadUrlGenerator.generateDownloadUrl(sequenceFilter, downloadOption);

                // Use the full match (including segment and format if present) as the key
                // This ensures we replace exactly what was in the template
                return {
                    ...acc,
                    [fullMatch.slice(1, -1)]: url, // Remove the [] brackets
                };
            },
            {} as Record<string, string>,
        );

        // Process template with all URLs
        return processTemplate(linkOut.url, urlMap);
    };

    return (
        <Menu as='div' className='ml-2 relative inline-block text-left'>
            <MenuButton className='outlineButton flex items-center' onClick={() => setIsOpen(!isOpen)}>
                Tools
                <IwwaArrowDown className='ml-2 h-5 w-5' aria-hidden='true' />
            </MenuButton>

            <MenuItems className='absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none'>
                <div className='py-1'>
                    {linkOuts.map((linkOut) => (
                        <MenuItem key={linkOut.name}>
                            {({ focus }) => (
                                <a
                                    href={generateLinkOutUrl(linkOut)}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    className={`
                                        ${focus ? 'bg-gray-100 text-gray-900' : 'text-gray-700'}
                                        flex items-center justify-between px-4 py-2 text-sm
                                    `}
                                >
                                    {linkOut.name}
                                    <DashiconsExternal className='h-4 w-4 ml-2' />
                                </a>
                            )}
                        </MenuItem>
                    ))}
                </div>
            </MenuItems>
        </Menu>
    );
};
