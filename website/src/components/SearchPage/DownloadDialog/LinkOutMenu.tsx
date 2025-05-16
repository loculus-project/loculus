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
    dataUseTermsEnabled: boolean;
};

export const LinkOutMenu: FC<LinkOutMenuProps> = ({
    downloadUrlGenerator,
    sequenceFilter,
    linkOuts,
    dataUseTermsEnabled,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isDataUseTermsModalVisible, setDataUseTermsModalVisible] = useState(false);
    const currentLinkOut = useRef<LinkOut | null>(null);

    const handleLinkClick = (linkOut: LinkOut) => {
        currentLinkOut.current = linkOut;
        if (dataUseTermsEnabled) {
            setDataUseTermsModalVisible(true);
        } else {
            const url = generateLinkOutUrl(currentLinkOut.current);
            openUrl(url);
        }
    };

    const generateLinkOutUrl = (linkOut: LinkOut, includeRestricted = false) => {
        const placeholders = matchPlaceholders(linkOut.url);

        const urlMap: Record<string, string> = {};
        for (const match of placeholders) {
            const { fullMatch, dataType, segment, richHeaders, dataFormat } = match;

            if (!DATA_TYPES.includes(dataType as DataType)) {
                continue;
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
            urlMap[fullMatch.slice(1, -1)] = url;
        }

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
        setDataUseTermsModalVisible(false);
    };

    const handleOpenLinkWithOpenOnly = () => {
        if (currentLinkOut.current) {
            const url = generateLinkOutUrl(currentLinkOut.current, false);
            openUrl(url);
        }
        setDataUseTermsModalVisible(false);
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

            {dataUseTermsEnabled && (
                <LinkOutMenuDataUseTermModal
                    modalVisible={isDataUseTermsModalVisible}
                    setModalVisible={setDataUseTermsModalVisible}
                    currentLinkOut={currentLinkOut}
                    onClick={handleOpenLinkWithOpenOnly}
                    onClick1={handleIncludeRestricted}
                />
            )}
        </>
    );
};

function LinkOutMenuDataUseTermModal(props: {
    modalVisible: boolean;
    setModalVisible: (value: ((prevState: boolean) => boolean) | boolean) => void;
    currentLinkOut: React.MutableRefObject<LinkOut | null>;
    onClick: () => void;
    onClick1: () => void;
}) {
    return (
        <BasicModal isModalVisible={props.modalVisible} setModalVisible={props.setModalVisible}>
            <div className='p-6'>
                <h2 className='text-xl font-bold mb-2'>
                    Options for launching {props.currentLinkOut.current?.name ?? 'Tool'}
                </h2>
                <h3 className='text-lg font-medium text-gray-700 mb-4 mt-6'>Data use terms</h3>
                <p className='mb-6 text-gray-600'>
                    Would you like to include restricted-use sequences in this analysis? (If you do, you must comply
                    with the Restricted-Use terms.)
                </p>
                <div className='flex justify-end space-x-4'>
                    <button
                        className='px-4 py-2 border border-gray-300 rounded-md text-gray-700 font-medium hover:bg-gray-50 transition-colors'
                        onClick={props.onClick}
                    >
                        Open sequences only
                    </button>
                    <button
                        className='px-4 py-2 bg-primary-600 text-white rounded-md font-medium hover:bg-primary-700 transition-colors'
                        onClick={props.onClick1}
                    >
                        Include Restricted-Use
                    </button>
                </div>
            </div>
        </BasicModal>
    );
}
