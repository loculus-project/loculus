import { type FC, useState } from 'react';
import { Menu } from '@headlessui/react';
import IwwaArrowDown from '~icons/iwwa/arrow-down';
import { type DownloadUrlGenerator, type DownloadOption } from './DownloadUrlGenerator';
import { type SequenceFilter } from './SequenceFilters';
import { type ReferenceGenomesSequenceNames } from '../../../types/referencesGenomes';
import { processTemplate } from '../../../utils/templateProcessor';
import type { DownloadDataType } from './DownloadDataType';

const DATA_TYPES = ["unalignedNucleotideSequences", "metadata", "alignedNucleotideSequences"] as const;

type LinkOut = {
    name: string;
    url: string;
};

type LinkOutMenuProps = {
    downloadUrlGenerator: DownloadUrlGenerator;
    sequenceFilter: SequenceFilter;
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames;
    linkOuts: LinkOut[];
};

export const LinkOutMenu: FC<LinkOutMenuProps> = ({
    downloadUrlGenerator,
    sequenceFilter,
    referenceGenomesSequenceNames,
    linkOuts,
}) => {
    const [isOpen, setIsOpen] = useState(false);

    const generateLinkOutUrl = (linkOut: LinkOut) => {
        // Find all placeholders in the template that match [type] or [type|format]
        const placeholderRegex = /\[([\w]+)(?:\|([\w]+))?\]/g;
        const placeholders = Array.from(linkOut.url.matchAll(placeholderRegex));
        
        // Generate URLs for all found placeholders
        const urlMap = placeholders.reduce((acc, match) => {
            const [fullMatch, dataType, dataFormat] = match;
            
            // Skip if not a valid data type
            if (!DATA_TYPES.includes(dataType as any)) {
                return acc;
            }

            const downloadOption: DownloadOption = {
                includeOldData: false,
                includeRestricted: false,
                dataType: {
                    type: dataType,
                    segment: undefined,
                },
                compression: undefined,
                dataFormat: dataFormat,
            };

            const { url } = downloadUrlGenerator.generateDownloadUrl(sequenceFilter, downloadOption);
            
            // Use the full match (including format if present) as the key
            // This ensures we replace exactly what was in the template
            return {
                ...acc,
                [fullMatch.slice(1, -1)]: url, // Remove the [] brackets
            };
        }, {} as Record<string, string>);

        // Process template with all URLs
        return processTemplate(linkOut.url, urlMap);
    };

    return (
        <Menu as="div" className="relative inline-block text-left">
            <Menu.Button 
                className="outlineButton flex items-center"
                onClick={() => setIsOpen(!isOpen)}
            >
                Link out
                <IwwaArrowDown className="ml-2 h-5 w-5" aria-hidden="true" />
            </Menu.Button>

            <Menu.Items className="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                <div className="py-1">
                    {linkOuts.map((linkOut) => (
                        <Menu.Item key={linkOut.name}>
                            {({ active }) => (
                                <a
                                    href={generateLinkOutUrl(linkOut)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`
                                        ${active ? 'bg-gray-100 text-gray-900' : 'text-gray-700'}
                                        block px-4 py-2 text-sm
                                    `}
                                >
                                    {linkOut.name}
                                </a>
                            )}
                        </Menu.Item>
                    ))}
                </div>
            </Menu.Items>
        </Menu>
    );
};