import { type FC, useState } from 'react';
import { Menu } from '@headlessui/react';
import IwwaArrowDown from '~icons/iwwa/arrow-down';
import { type DownloadUrlGenerator, type DownloadOption } from './DownloadUrlGenerator';
import { type SequenceFilter } from './SequenceFilters';
import { type ReferenceGenomesSequenceNames } from '../../../types/referencesGenomes';
import { processTemplate } from '../../../utils/templateProcessor';

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
        const downloadOption: DownloadOption = {
            includeOldData: false,
            includeRestricted: false,
            dataType: 'aligned',
            compression: undefined,
        };

        const { url: fastaUrl } = downloadUrlGenerator.generateDownloadUrl(sequenceFilter, downloadOption);

        return processTemplate(linkOut.url, {
            fastaUrl,
        });
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
