import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { type FC, useState, useRef } from 'react';

import { type DownloadUrlGenerator, type DownloadOption } from './DownloadUrlGenerator';
import { type SequenceFilter } from './SequenceFilters';
import { approxMaxAcceptableUrlLength } from '../../../routes/routes';
import { processTemplate, matchPlaceholders } from '../../../utils/templateProcessor';
import BasicModal from '../../common/Modal';
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
    const [isModalVisible, setModalVisible] = useState(false);
    const currentLinkOut = useRef<LinkOut | null>(null);

    const handleLinkClick = (linkOut: LinkOut) => {
        currentLinkOut.current = linkOut;
        setModalVisible(true);
    };

    const generateLinkOutUrl = (linkOut: LinkOut, includeRestricted = false) => {
        const placeholders = matchPlaceholders(linkOut.url);

        const urlMap = placeholders.reduce(
            (acc, match) => {
                const { fullMatch, dataType, segment, richHeaders, dataFormat } = match;

                if (!DATA_TYPES.includes(dataType as DataType)) {
                    return acc;
                }

                const downloadOption: DownloadOption = {
                    includeRestricted: includeRestricted,
                    dataType: {
                        type: dataType as DataType,
                        segment: segment,
                        includeRichFastaHeaders: richHeaders ? true : undefined,
                    },
                    compression: undefined,
                    dataFormat: dataFormat,
                };

                const { url } = downloadUrlGenerator.generateDownloadUrl(sequenceFilter, downloadOption);

                return {
                    ...acc,
                    [fullMatch.slice(1, -1)]: url,
                };
            },
            {} as Record<string, string>,
        );

        return processTemplate(linkOut.url, urlMap);
    };

    const openUrl = (url: string) => {
        if (url.length > approxMaxAcceptableUrlLength) {
            alert(
                `Warning: The generated URL for the tool is very long (${url.length} characters) and may not work in some browsers or servers. This may relate to your current search filter settings.`,
            );
        }
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const handleIncludeRestricted = () => {
        if (currentLinkOut.current) {
            const url = generateLinkOutUrl(currentLinkOut.current, true);
            openUrl(url);
        }
        setModalVisible(false);
    };

    const handleOpenLinkWithOpenOnly = () => {
        if (currentLinkOut.current) {
            const url = generateLinkOutUrl(currentLinkOut.current, false);
            openUrl(url);
        }
        setModalVisible(false);
    };

    return (
        <>
            <Menu as='div' className='ml-2 relative inline-block text-left'>
                <MenuButton
                    className='outlineButton flex items-center min-w-[100px] justify-between h-full'
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <span>Tools</span>
                    <IwwaArrowDown className='ml-2 h-5 w-5' aria-hidden='true' />
                </MenuButton>

                <MenuItems className='absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none'>
                    <div className='py-1'>
                        {linkOuts.map((linkOut) => (
                            <MenuItem key={linkOut.name}>
                                {({ focus }) => (
                                    <button
                                        onClick={() => handleLinkClick(linkOut)}
                                        className={`
                                            ${focus ? 'bg-gray-100 text-gray-900' : 'text-gray-700'}
                                            flex items-center justify-between px-4 py-2 text-sm w-full text-left
                                        `}
                                    >
                                        {linkOut.name}
                                        <DashiconsExternal className='h-4 w-4 ml-2' />
                                    </button>
                                )}
                            </MenuItem>
                        ))}
                    </div>
                </MenuItems>
            </Menu>

            <BasicModal isModalVisible={isModalVisible} setModalVisible={setModalVisible}>
                <div className='p-6'>
                    <h2 className='text-xl font-bold mb-2'>
                        Options for launching {currentLinkOut.current?.name ?? 'Tool'}
                    </h2>
                    <h3 className='text-lg font-medium text-gray-700 mb-4 mt-6'>Data use terms</h3>
                    <p className='mb-6 text-gray-600'>
                        Would you like to include restricted-use sequences in this analysis? (If you do, you must comply
                        with the Restricted-Use terms.)
                    </p>
                    <div className='flex justify-end space-x-4'>
                        <button
                            className='px-4 py-2 border border-gray-300 rounded-md text-gray-700 font-medium hover:bg-gray-50 transition-colors'
                            onClick={handleOpenLinkWithOpenOnly}
                        >
                            Open sequences only
                        </button>
                        <button
                            className='px-4 py-2 bg-primary-600 text-white rounded-md font-medium hover:bg-primary-700 transition-colors'
                            onClick={handleIncludeRestricted}
                        >
                            Include Restricted-Use
                        </button>
                    </div>
                </div>
            </BasicModal>
        </>
    );
};
